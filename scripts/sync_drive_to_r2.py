#!/usr/bin/env python3
import os
import json
import tempfile
import subprocess
import wave
import io
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
import boto3
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from google.oauth2 import service_account

def check_env_vars():
    required = [
        "GD_SERVICE_ACCOUNT_JSON",
        "GD_FOLDER_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_ENDPOINT",
        "R2_BUCKET_NAME"
    ]
    missing = [var for var in required if not os.environ.get(var)]
    if missing:
        print(f"LỖI: Thiếu các biến môi trường bắt buộc sau: {', '.join(missing)}")
        sys.exit(1)

def get_drive_service(service_account_json_str):
    try:
        # Nếu service_account_json_str là một đường dẫn file thực tế
        if os.path.exists(service_account_json_str):
            creds = service_account.Credentials.from_service_account_file(
                service_account_json_str, 
                scopes=['https://www.googleapis.com/auth/drive.readonly']
            )
        else:
            # Nếu là chuỗi JSON trực tiếp, ghi ra file tạm
            with tempfile.NamedTemporaryFile(mode='w+', suffix='.json', delete=False) as temp_file:
                temp_file.write(service_account_json_str)
                temp_file_path = temp_file.name
            
            creds = service_account.Credentials.from_service_account_file(
                temp_file_path, 
                scopes=['https://www.googleapis.com/auth/drive.readonly']
            )
            # Dọn dẹp file tạm sau khi đã tải credentials vào bộ nhớ
            try:
                os.remove(temp_file_path)
            except OSError:
                pass
                
        return build('drive', 'v3', credentials=creds)
    except Exception as e:
        print(f"LỖI: Không thể khởi tạo Google Drive Service: {e}")
        sys.exit(1)

def get_wav_duration(wav_path):
    try:
        with wave.open(wav_path, 'rb') as f:
            frames = f.getnframes()
            rate = f.getframerate()
            duration = frames / float(rate)
            return int(duration)
    except Exception as e:
        print(f"Cảnh báo: Không thể đọc thời lượng file WAV qua thư viện wave ({e}). Mặc định 180s.")
        return 180

def convert_wav_to_mp3(wav_path, mp3_path):
    try:
        print(f"Đang nén: {wav_path} -> {mp3_path} (MP3 128kbps)...")
        # Sử dụng lệnh ffmpeg qua subprocess để chuyển đổi
        result = subprocess.run([
            'ffmpeg', '-y', '-i', wav_path,
            '-codec:a', 'libmp3lame', '-b:a', '128k',
            mp3_path
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"LỖI: FFmpeg gặp lỗi khi nén nhạc: {e.stderr.decode('utf-8')}")
        return False
    except FileNotFoundError:
        print("LỖI: Không tìm thấy lệnh ffmpeg trên hệ thống máy ảo! Hãy đảm bảo đã cài đặt ffmpeg.")
        return False

def get_existing_playlist(r2_client, bucket_name):
    try:
        response = r2_client.get_object(Bucket=bucket_name, Key='playlist.json')
        content = response['Body'].read().decode('utf-8')
        return json.loads(content)
    except Exception as e:
        print("Cảnh báo: Không tìm thấy file playlist.json cũ trên R2 hoặc lỗi đọc file. Khởi tạo danh sách mới.")
        return {"tracks": [], "playlists": {}}

def map_weather_code(code):
    if code == 0: return "trời nắng trong xanh"
    if code in [1, 2, 3]: return "mây nhẹ mát mẻ"
    if code in [45, 48]: return "sương mù nhẹ"
    if code in [51, 53, 55]: return "mưa phùn nhẹ"
    if code in [61, 63, 65]: return "mưa rào"
    if code in [71, 73, 75]: return "se se lạnh"
    if code in [80, 81, 82]: return "mưa giông"
    if code in [95, 96, 99]: return "giông bão"
    return "mát mẻ"

def get_tomorrow_weather():
    url = "https://api.open-meteo.com/v1/forecast?latitude=10.7222&longitude=106.6783&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FSingapore"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'DOCABot/1.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            if "daily" in data and len(data["daily"]["weather_code"]) > 1:
                weather_code = data["daily"]["weather_code"][1]
                temp_max = data["daily"]["temperature_2m_max"][1]
                temp_min = data["daily"]["temperature_2m_min"][1]
                return {
                    "code": weather_code,
                    "temp_max": temp_max,
                    "temp_min": temp_min
                }
    except Exception as e:
        print(f"Cảnh báo: Không lấy được dự báo thời tiết ngày mai ({e}). Sử dụng giá trị mặc định.")
    return {"code": 3, "temp_max": 32, "temp_min": 25}

def generate_story_via_gemini(api_key, weather_desc, slot, song_titles):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={api_key}"
    slot_vn = "buổi sáng" if slot == "morning" else "buổi chiều" if slot == "afternoon" else "buổi tối"
    
    prompt = f"""
    Bạn là Tina, host ảo của radio chữa lành DOCA FM cho thú cưng và chủ nuôi.
    Hãy viết lời tựa (story) và lời dẫn (intro) cho khung giờ phát nhạc '{slot_vn}' ngày mai.
    
    Thông tin đầu vào:
    - Khung giờ: {slot_vn}
    - Thời tiết ngày mai dự kiến: {weather_desc}
    - Danh sách tên các bài phát: {", ".join(song_titles)}
    
    Yêu cầu:
    1. Lời tựa câu chuyện (story): Viết 2-3 câu kể về Boss (thú cưng) và Sen (chủ nuôi) theo phong cách tiểu thuyết Nhật Bản (nhẹ nhàng, lững lờ, Iyashikei chữa lành). Lồng ghép khéo léo và tự nhiên tên các bài hát trên vào câu chuyện (có thể dịch nghĩa hoặc giữ nguyên tiếng Anh trong văn cảnh tiếng Việt sao cho mượt mà).
    2. Tiêu đề câu chuyện (story_title): 1 tiêu đề ngắn gọn mang vibe tiểu thuyết Nhật Bản.
    3. Lời dẫn (intro): Lời chào ấm áp, thân thương của Tina gửi tới cô/chú, đề cập đến thời tiết ngày mai ({weather_desc}) và giới thiệu playlist. Giọng điệu Empathetic, Iyashikei chữa lành.
    4. Trả về đúng 1 đối tượng JSON duy nhất có dạng:
    {{
        "title": "tiêu đề vibe badge kèm emoji dài khoảng 3-5 từ (ví dụ: Thanh Âm Chiếu Chiếu 🍵, Chiều Mưa Kissaten 🌧️, Nắng Sớm Bên Hiên ☕)",
        "story_title": "tiêu đề câu chuyện",
        "story": "nội dung lời tựa lồng ghép tên các bài hát",
        "intro": "lời dẫn của Tina"
    }}
    Lưu ý: Chỉ trả về chuỗi JSON thuần túy, không có thẻ ```json hoặc các định dạng text khác.
    """
    
    payload = {
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }
    
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            text_response = res_data["candidates"][0]["content"]["parts"][0]["text"].strip()
            if text_response.startswith("```"):
                lines = text_response.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines[-1].startswith("```"):
                    lines = lines[:-1]
                text_response = "\n".join(lines).strip()
            return json.loads(text_response)
    except Exception as e:
        print(f"Lỗi khi gọi Gemini API cho slot {slot}: {e}")
        return None

def generate_story_fallback(weather_desc, slot, song_titles):
    if slot == "morning":
        title = "Nắng Sớm Bên Hiên ☕"
        story_title = "Màn Sương Sớm Trên Lớp Rêu Xanh"
        story = f"Nắng mai lấp lánh khẽ đánh thức cả căn phòng. Giữa không gian yên bình ấy, bản nhạc {', '.join(song_titles[:2])} ngân nga đưa chú mèo và Sen bước vào một ngày mới thật dịu ngọt."
        intro = f"Chào cô/chú nhé! Sáng mai trời {weather_desc} thật dễ chịu. Tina mời cả nhà cùng thưởng tách trà xanh ấm và lắng nghe tiếng jazz dịu êm đón ngày mới... 🐾"
    elif slot == "afternoon":
        title = "Góc Khuất Bình Yên 🍃"
        story_title = "Cửa Gỗ Sồi Và Mùi Cà Phê Mộc"
        story = f"Chú cún nằm lười bên cửa sổ ngắm lá rụng thong thả. Khi giai điệu {', '.join(song_titles[:2])} dịu dàng cất lên, mọi lo toan dường như được gió trưa cuốn trôi."
        intro = f"Tina chào cả nhà nhé! Trưa chiều mai trời {weather_desc}, cô/chú đã nghỉ ngơi chưa nhỉ? Ghé lại góc nhỏ quen thuộc này và thả hồn vào những thanh âm mộc mạc nhé... 🍃"
    else:
        title = "Đèn Vàng Vĩ Tuyến 🌙"
        story_title = "Đom Đóm Bay Qua Cửa Sổ Tròn"
        story = f"Ánh đèn ngủ vàng ấm áp bao trùm lấy góc nhỏ thân thương. Cùng bé cưng nghe bản nhạc {', '.join(song_titles[:2])} êm dịu gác lại một ngày dài bình yên."
        intro = f"Tối muộn rồi cô/chú ơi, đêm mai trời có vẻ {weather_desc} đấy. Cùng bé cưng đắp chiếc chăn mỏng, nghe bản nhạc êm dịu này và chìm vào giấc ngủ ngon nhé... 🌙"
        
    return {
        "title": title,
        "story_title": story_title,
        "story": story,
        "intro": intro
    }

def update_tomorrow_playlist(tracks, existing_playlists=None):
    playlists = existing_playlists or {}
    day_names = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"]
    slots = ["morning", "afternoon", "evening"]
    
    # 1. Baseline initialization if day structure is missing
    for d in range(7):
        d_str = str(d)
        if d_str not in playlists or not playlists[d_str]:
            playlists[d_str] = {
                "morning": {
                    "title": f"Nắng Sớm Bên Hiên ({day_names[d]}) ☕",
                    "story_title": "Tách Trà Sớm Và Tiếng Đuôi Gõ Nhịp",
                    "story": "Mở đầu ngày mới bên tách trà sớm ấm áp và ngọt lành của bé cưng.",
                    "tracks": []
                },
                "afternoon": {
                    "title": f"Góc Khuất Bình Yên ({day_names[d]}) 🍃",
                    "story_title": "Nắng Trưa Đậu Trên Bộ Lông Khô Ráo",
                    "story": "Góc nằm lười trưa nắng bên cửa sổ đón ngọn gió mát lành.",
                    "tracks": []
                },
                "evening": {
                    "title": f"Đèn Vàng Vĩ Tuyến ({day_names[d]}) 🌙",
                    "story_title": "Đèn Đêm Vàng Và Giấc Mộng Màu Xanh",
                    "story": "Ánh đèn đêm ấm áp vang lên bản jazz êm đềm xoa dịu những nhọc nhằn.",
                    "tracks": []
                }
            }
            num_tracks = len(tracks)
            if num_tracks > 0:
                for s_idx, slot in enumerate(slots):
                    idx = d + s_idx * 7
                    for offset in range(4):
                        track_idx = (idx + offset * 21) % num_tracks
                        track_id = tracks[track_idx]["id"]
                        if track_id not in playlists[d_str][slot]["tracks"]:
                            playlists[d_str][slot]["tracks"].append(track_id)
                            
    # 2. Calculate tomorrow date in Vietnam time (ICT, UTC+7)
    utc_now = datetime.utcnow()
    vietnam_now = utc_now + timedelta(hours=7)
    tomorrow = vietnam_now + timedelta(days=1)
    tomorrow_day_idx = (tomorrow.weekday() + 1) % 7
    tomorrow_day_str = str(tomorrow_day_idx)
    tomorrow_day_name = day_names[tomorrow_day_idx]
    
    print(f"\n[Curation] Thời gian hiện tại (ICT): {vietnam_now.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[Curation] Chuẩn bị danh sách phát cho ngày mai: {tomorrow.strftime('%Y-%m-%d')} ({tomorrow_day_name}, Index: {tomorrow_day_idx})")
    
    # 3. Lấy thời tiết ngày mai
    weather = get_tomorrow_weather()
    weather_desc = map_weather_code(weather["code"])
    temp_max = weather["temp_max"]
    temp_min = weather["temp_min"]
    weather_info_str = f"{weather_desc} ({temp_min}°C - {temp_max}°C)"
    print(f"[Curation] Thời tiết ngày mai dự kiến: {weather_info_str}")
    
    # 4. Phân nhóm bài hát dựa trên thư mục trong URL
    grouped_tracks = {
        "morning_brighter": [],
        "sleepy_ambient": [],
        "focused_study": [],
        "nostalgic_retro": [],
        "classic_jazz": [],
        "all": []
    }
    
    for t in tracks:
        url_lower = t.get("url", "").lower()
        grouped_tracks["all"].append(t)
        if "morning tea" in url_lower or "soft morning" in url_lower:
            grouped_tracks["morning_brighter"].append(t)
        elif "deep sleep" in url_lower:
            grouped_tracks["sleepy_ambient"].append(t)
        elif "cozy library" in url_lower:
            grouped_tracks["focused_study"].append(t)
        elif "old love letters" in url_lower:
            grouped_tracks["nostalgic_retro"].append(t)
        elif "1940s vintage cafe" in url_lower:
            grouped_tracks["classic_jazz"].append(t)
            
    # 5. Phân nhóm thời tiết để chọn pool nhạc phù hợp
    is_rainy = weather["code"] in [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]
    is_sunny = weather["code"] == 0 or temp_max >= 31
    weather_cond = "rainy" if is_rainy else "sunny" if is_sunny else "cloudy"
    print(f"[Curation] Nhóm thời tiết: {weather_cond.upper()}")
    
    pools = {
        "morning": [],
        "afternoon": [],
        "evening": []
    }
    
    if weather_cond == "rainy":
        pools["morning"] = grouped_tracks["morning_brighter"] + grouped_tracks["focused_study"]
        pools["afternoon"] = grouped_tracks["focused_study"] + grouped_tracks["classic_jazz"]
        pools["evening"] = grouped_tracks["sleepy_ambient"] + grouped_tracks["focused_study"]
    elif weather_cond == "sunny":
        pools["morning"] = grouped_tracks["morning_brighter"]
        pools["afternoon"] = grouped_tracks["morning_brighter"] + grouped_tracks["nostalgic_retro"]
        pools["evening"] = grouped_tracks["classic_jazz"] + grouped_tracks["nostalgic_retro"]
    else: # cloudy
        pools["morning"] = grouped_tracks["morning_brighter"]
        pools["afternoon"] = grouped_tracks["nostalgic_retro"] + grouped_tracks["focused_study"]
        pools["evening"] = grouped_tracks["classic_jazz"] + grouped_tracks["sleepy_ambient"]
        
    for slot in slots:
        if not pools[slot]:
            pools[slot] = grouped_tracks["all"]
            
    # 6. Chọn bài hát (4 bài mỗi slot) dựa trên ngày của ngày mai để đa dạng hóa
    selected_ids = {}
    selected_titles = {}
    tomorrow_day = tomorrow.day
    
    for slot in slots:
        pool = pools[slot]
        unique_pool = []
        seen = set()
        for t in pool:
            if t["id"] not in seen:
                unique_pool.append(t)
                seen.add(t["id"])
        if len(unique_pool) < 4:
            for t in grouped_tracks["all"]:
                if t["id"] not in seen:
                    unique_pool.append(t)
                    seen.add(t["id"])
                    
        selected = []
        for i in range(4):
            idx = (tomorrow_day * 3 + i) % len(unique_pool)
            selected.append(unique_pool[idx])
            
        selected_ids[slot] = [t["id"] for t in selected]
        selected_titles[slot] = [t["title"] for t in selected]
        
    # 7. Gọi Gemini API để tự động sinh lời tựa và lời dẫn
    gemini_key = os.environ.get("PUBLIC_GEMINI_API_KEY")
    
    for slot in slots:
        story_data = None
        if gemini_key:
            print(f"[Curation] Đang dùng Gemini API viết truyện cho slot {slot}...")
            story_data = generate_story_via_gemini(gemini_key, weather_info_str, slot, selected_titles[slot])
            
        if not story_data:
            print(f"[Curation] Sử dụng nội dung dự phòng (fallback) cho slot {slot}.")
            story_data = generate_story_fallback(weather_info_str, slot, selected_titles[slot])
            
        playlists[tomorrow_day_str][slot] = {
            "title": story_data.get("title", f"{slot.capitalize()} FM"),
            "story_title": story_data.get("story_title", "Cốt truyện chữa lành"),
            "story": story_data.get("story", ""),
            "intro": story_data.get("intro", ""),
            "tracks": selected_ids[slot]
        }
        
    print(f"[Curation] Đã cập nhật thành công danh sách phát cho ngày mai ({tomorrow_day_name}).")
    return playlists

def get_all_wav_files_recursive(drive_service, parent_id, current_path=""):
    files_list = []
    query = f"'{parent_id}' in parents and trashed = false"
    page_token = None
    
    while True:
        try:
            results = drive_service.files().list(
                q=query, 
                fields="nextPageToken, files(id, name, mimeType)",
                pageToken=page_token
            ).execute()
            items = results.get('files', [])
        except Exception as e:
            print(f"Lỗi quét Drive tại thư mục {parent_id}: {e}")
            break
            
        for item in items:
            if item['mimeType'] == 'application/vnd.google-apps.folder':
                # Đệ quy vào thư mục con
                sub_path = os.path.join(current_path, item['name']) if current_path else item['name']
                files_list.extend(get_all_wav_files_recursive(drive_service, item['id'], sub_path))
            elif item['name'].lower().endswith('.wav'):
                # Tìm thấy file WAV
                files_list.append({
                    "id": item['id'],
                    "name": item['name'],
                    "relative_path": current_path
                })
                
        page_token = results.get('nextPageToken')
        if not page_token:
            break
            
    return files_list

def load_env():
    # Tìm tệp .env ở thư mục hiện tại hoặc doca-affiliate-web/
    paths = [".env", "doca-affiliate-web/.env"]
    for p in paths:
        if os.path.exists(p):
            print(f"Đang tải cấu hình môi trường từ {p}...")
            with open(p, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    parts = line.split('=', 1)
                    if len(parts) == 2:
                        key = parts[0].strip()
                        val = parts[1].strip().strip('"').strip("'")
                        os.environ[key] = val
            break

def main():
    load_env()
    check_env_vars()
    
    # Đọc cấu hình môi trường và tự động làm sạch ký tự xuống dòng (\r, \n) hay khoảng trắng
    sa_json = os.environ["GD_SERVICE_ACCOUNT_JSON"].strip()
    drive_folder_id = os.environ["GD_FOLDER_ID"].strip()
    r2_access_key = os.environ["R2_ACCESS_KEY_ID"].strip()
    
    # Làm sạch khóa bí mật đề phòng dính cả tiền tố R2_SECRET_ACCESS_KEY=
    r2_secret_key = os.environ["R2_SECRET_ACCESS_KEY"].strip().strip('"').strip("'")
    if r2_secret_key.startswith("R2_SECRET_ACCESS_KEY="):
        r2_secret_key = r2_secret_key.split("=", 1)[1].strip().strip('"').strip("'")
        
    r2_endpoint = os.environ["R2_ENDPOINT"].strip()
    r2_bucket = os.environ["R2_BUCKET_NAME"].strip()
    
    # Khởi tạo kết nối dịch vụ
    drive_service = get_drive_service(sa_json)
    
    r2_client = boto3.client(
        's3',
        endpoint_url=r2_endpoint,
        aws_access_key_id=r2_access_key,
        aws_secret_access_key=r2_secret_key
    )
    
    # 1. Tải playlist.json hiện tại từ R2
    playlist_data = get_existing_playlist(r2_client, r2_bucket)
    tracks_list = playlist_data.get("tracks", [])
    
    # Lưu map để tra cứu bài hát đã tồn tại
    existing_track_ids = {t["id"] for t in tracks_list}
    existing_filenames = {os.path.basename(t["url"]) for t in tracks_list}
    
    # 2. Quét đệ quy thư mục Google Drive để tìm kiếm các tệp âm thanh WAV trong các thư mục con
    print(f"Đang quét đệ quy thư mục Google Drive (ID: {drive_folder_id})...")
    drive_files = get_all_wav_files_recursive(drive_service, drive_folder_id)
    print(f"Tìm thấy {len(drive_files)} tệp âm thanh WAV trên Google Drive (bao gồm các thư mục con).")
    
    new_tracks_uploaded = False
    
    # 3. Duyệt qua từng file nhạc trên Drive
    for f in drive_files:
        file_id = f['id']
        file_name = f['name']
        
        # Tạo tên file MP3 tương ứng
        base_name = os.path.splitext(file_name)[0]
        mp3_name = f"{base_name}.mp3"
        
        # Kiểm tra xem bài hát này đã được đồng bộ lên R2 chưa
        if file_id in existing_track_ids or mp3_name in existing_filenames:
            print(f"Bài hát đã được đồng bộ trước đó: {file_name}. Bỏ qua.")
            continue
            
        print(f"\n--- Đang xử lý bài hát mới: {file_name} ---")
        
        # Khởi tạo các file tạm thời
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_wav:
            temp_wav_path = temp_wav.name
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as temp_mp3:
            temp_mp3_path = temp_mp3.name
            
        try:
            # Tải file WAV từ Google Drive về máy
            print(f"Đang tải file từ Drive...")
            request = drive_service.files().get_media(fileId=file_id)
            fh = io.FileIO(temp_wav_path, 'wb')
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while done is False:
                status, done = downloader.next_chunk()
            fh.close()
            
            # Tính thời lượng giây của file WAV gốc
            duration = get_wav_duration(temp_wav_path)
            
            # Thực hiện nén file WAV sang MP3 128kbps bằng ffmpeg
            if convert_wav_to_mp3(temp_wav_path, temp_mp3_path):
                # Xác định key của R2 (bao gồm cả thư mục con)
                relative_path = f.get('relative_path', '')
                if relative_path:
                    web_relative_path = relative_path.replace('\\', '/')
                    r2_key = f"tracks/{web_relative_path}/{mp3_name}"
                else:
                    r2_key = f"tracks/{mp3_name}"

                # Tải file MP3 đã nén lên Cloudflare R2
                print(f"Đang tải file MP3 lên Cloudflare R2 với Key: {r2_key}...")
                r2_client.upload_file(
                    temp_mp3_path, 
                    r2_bucket, 
                    r2_key,
                    ExtraArgs={'ContentType': 'audio/mpeg'}
                )
                
                # Xác định URL tải nhạc công khai trên Cloudflare R2
                r2_public_domain = os.environ.get("R2_PUBLIC_DOMAIN", "").rstrip('/')
                if r2_public_domain:
                    track_url = f"{r2_public_domain}/{r2_key}"
                else:
                    # Fallback dùng URL tương đối trong bucket, Client-side sẽ tự ghép với domain R2 CDN
                    track_url = r2_key
                
                # Thêm bài hát vào danh sách phát
                tracks_list.append({
                    "id": file_id,
                    "title": base_name,
                    "artist": "Tina's Cozy Song 🐾",
                    "url": track_url,
                    "duration": duration
                })
                
                new_tracks_uploaded = True
                print(f"Đồng bộ thành công bài hát: {file_name}!")
        except Exception as e:
            print(f"LỖI xảy ra trong quá trình xử lý bài hát: {e}")
        finally:
            # Xóa các tệp tạm thời
            for p in [temp_wav_path, temp_mp3_path]:
                if os.path.exists(p):
                    try:
                        os.remove(p)
                    except OSError:
                        pass
                        
    # 4. Luôn cập nhật danh sách phát ngày mai và upload playlist.json lên R2
    print("\n--- Đang chuẩn bị và cập nhật danh sách phát ngày mai (Weather-based Curation) ---")
    
    # Đọc existing playlists từ playlist_data
    existing_playlists = playlist_data.get("playlists", {})
    
    # Cập nhật danh sách phát ngày mai
    updated_playlists = update_tomorrow_playlist(tracks_list, existing_playlists)
    
    updated_playlist_data = {
        "tracks": tracks_list,
        "playlists": updated_playlists
    }
    
    # Upload playlist.json lên R2
    try:
        r2_client.put_object(
            Bucket=r2_bucket,
            Key='playlist.json',
            Body=json.dumps(updated_playlist_data, ensure_ascii=False, indent=2),
            ContentType='application/json'
        )
        print("Đã tải tệp tin playlist.json mới lên Cloudflare R2 thành công!")
    except Exception as e:
        print(f"LỖI: Không thể upload playlist.json lên R2: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
