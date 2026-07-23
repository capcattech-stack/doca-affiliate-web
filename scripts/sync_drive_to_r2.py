#!/usr/bin/env python3
import os
import json
import tempfile
import subprocess
import wave
import io
import sys
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

def distribute_tracks_to_playlists(tracks):
    """
    Phân bổ xoay vòng các bài hát vào 7 ngày trong tuần, mỗi ngày có 3 slot: morning, afternoon, evening.
    Đảm bảo 100% tất cả 21 slots đều có ít nhất 1 bài hát (nếu tổng số bài hát >= 1).
    """
    slots = ["morning", "afternoon", "evening"]
    playlists = {}
    
    day_names = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"]
    
    # Khởi tạo khung cấu trúc trống cho 7 ngày (0: Chủ nhật, 1: Thứ hai, ...)
    for d in range(7):
        playlists[str(d)] = {
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
    if num_tracks == 0:
        return playlists

    # Điền nhạc xoay vòng (round-robin) vào 21 slots đầu tiên
    for idx in range(21):
        day_idx = idx % 7
        slot_name = slots[(idx // 7) % 3]
        track_selected = tracks[idx % num_tracks]
        playlists[str(day_idx)][slot_name]["tracks"].append(track_selected["id"])
        
    # Nếu có nhiều hơn 21 bài hát, tiếp tục phân bổ đều phần còn lại
    if num_tracks > 21:
        for idx in range(21, num_tracks):
            day_idx = idx % 7
            slot_name = slots[(idx // 7) % 3]
            playlists[str(day_idx)][slot_name]["tracks"].append(tracks[idx]["id"])
            
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
    
    # Đọc cấu hình môi trường
    sa_json = os.environ["GD_SERVICE_ACCOUNT_JSON"]
    drive_folder_id = os.environ["GD_FOLDER_ID"]
    r2_access_key = os.environ["R2_ACCESS_KEY_ID"]
    r2_secret_key = os.environ["R2_SECRET_ACCESS_KEY"]
    r2_endpoint = os.environ["R2_ENDPOINT"]
    r2_bucket = os.environ["R2_BUCKET_NAME"]
    
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
                        
    # 4. Nếu có nhạc mới, cập nhật lại cấu trúc playlist và upload đè playlist.json lên R2
    if new_tracks_uploaded or not playlist_data.get("playlists"):
        print("\nĐang cập nhật lại tệp playlist.json...")
        
        # Phân phối xoay vòng lại nhạc vào các slot 7 ngày
        playlists_config = distribute_tracks_to_playlists(tracks_list)
        
        updated_playlist_data = {
            "tracks": tracks_list,
            "playlists": playlists_config
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
    else:
        print("\nKhông phát hiện bài hát mới nào cần đồng bộ.")

if __name__ == "__main__":
    main()
