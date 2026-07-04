#!/usr/bin/env python3
import os
import json
import urllib.request
import urllib.parse
import sys
import re
import tempfile
from datetime import datetime, timedelta

def load_env(env_path):
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                parts = line.split('=', 1)
                if len(parts) == 2:
                    env_vars[parts[0].strip()] = parts[1].strip()
    return env_vars

def query_commons(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'DOCABot/1.0 (contact@doca.pet)'})
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error querying Wikimedia API: {e}", file=sys.stderr)
        return None

def download_file(url, dest_path):
    req = urllib.request.Request(url, headers={'User-Agent': 'DOCABot/1.0 (contact@doca.pet)'})
    try:
        with urllib.request.urlopen(req) as response, open(dest_path, 'wb') as out_file:
            out_file.write(response.read())
        return True
    except Exception as e:
        print(f"Error downloading {url}: {e}", file=sys.stderr)
        return False

def upload_to_supabase(sb_url, sb_key, bucket, dest_name, file_path):
    upload_url = f"{sb_url}/storage/v1/object/{bucket}/{urllib.parse.quote(dest_name)}"
    
    ext = os.path.splitext(file_path)[1].lower()
    content_type = "audio/mpeg"
    if ext == ".ogg" or ext == ".oga":
        content_type = "audio/ogg"
    elif ext == ".mp3":
        content_type = "audio/mpeg"
    elif ext == ".opus":
        content_type = "audio/opus"
        
    try:
        with open(file_path, 'rb') as f:
            data = f.read()
            
        req = urllib.request.Request(
            upload_url,
            data=data,
            headers={
                'apikey': sb_key,
                'Authorization': f'Bearer {sb_key}',
                'Content-Type': content_type,
                'x-upsert': 'true'
            },
            method='POST'
        )
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            return response.status, res_body
    except urllib.error.HTTPError as e:
        res_body = e.read().decode('utf-8') if e else ""
        print(f"HTTP Error {e.code} uploading to Supabase: {res_body}", file=sys.stderr)
        return e.code, res_body
    except Exception as e:
        print(f"Error uploading to Supabase: {e}", file=sys.stderr)
        return None, str(e)

def delete_all_files(sb_url, sb_key, bucket):
    # 1. List files in bucket
    list_url = f"{sb_url}/storage/v1/object/list/{bucket}"
    req = urllib.request.Request(
        list_url,
        data=json.dumps({"prefix": "", "limit": 500}).encode('utf-8'),
        headers={
            'apikey': sb_key,
            'Authorization': f'Bearer {sb_key}',
            'Content-Type': 'application/json'
        },
        method='POST'
    )
    try:
        with urllib.request.urlopen(req) as response:
            files = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error listing files: {e}")
        return
        
    filenames = [f["name"] for f in files if f["name"] != ".keep"]
    if not filenames:
        print("Storage bucket is already empty.")
        return
        
    print(f"\n[Storage] Found {len(filenames)} files to delete: {filenames}")
    
    # 2. Delete files in batch
    del_url = f"{sb_url}/storage/v1/object/{bucket}"
    req2 = urllib.request.Request(
        del_url,
        data=json.dumps({"prefixes": filenames}).encode('utf-8'),
        headers={
            'apikey': sb_key,
            'Authorization': f'Bearer {sb_key}',
            'Content-Type': 'application/json'
        },
        method='DELETE'
    )
    try:
        with urllib.request.urlopen(req2) as response:
            print("[Storage] Successfully cleared all old files from the bucket.")
    except Exception as e:
        print(f"[Storage] Error deleting files: {e}")

def generate_playlist_for_day(day_idx, playlist_tracks, seed_slots, seed_cultures):
    day_names = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"]
    day_name = day_names[day_idx]
    
    culture = "japanese" if day_idx in [2, 4, 6] else "western"
    day_playlists = {}
    
    for slot in ["morning", "afternoon", "evening"]:
        slot_tracks = [t for t in playlist_tracks if seed_slots.get(t["id"]) == slot and seed_cultures.get(t["id"]) == culture]
        
        if not slot_tracks:
            # Fallback if no tracks in this culture/slot yet (gracefully pull from general slot tracks)
            slot_tracks = [t for t in playlist_tracks if seed_slots.get(t["id"]) == slot]
            
        if len(slot_tracks) <= 10:
            selected_ids = [t["id"] for t in slot_tracks]
        else:
            newest_pool = slot_tracks[-5:]
            older_pool = slot_tracks[:-5]
            
            newest_ids = [t["id"] for t in newest_pool]
            
            o_start = (day_idx * 2) % len(older_pool)
            older_ids = [older_pool[(o_start + i) % len(older_pool)]["id"] for i in range(5)]
            
            selected_ids = newest_ids + older_ids
            
        if culture == "japanese":
            if slot == "morning":
                day_playlists["morning"] = {
                    "title": f"Thanh Âm Chiếu Chiếu ({day_name}) 🍵",
                    "story_title": "Màn Sương Sớm Trên Lớp Rêu Xanh",
                    "story": "Vườn nhỏ Nhật Bản đón giọt sương mai. Tiếng sáo trúc hòa quyện với jazz nhẹ nhàng, mang lại khoảnh khắc tĩnh tại bình yên cho tâm hồn.",
                    "intro": f"Chào cô/chú nhé! Sớm hôm nay thật [thời tiết] trong lành. Tina mời cả nhà thưởng tách trà xanh ấm và lắng nghe tiếng jazz Nhật dịu êm đón ngày mới... 🐾",
                    "tracks": selected_ids
                }
            elif slot == "afternoon":
                day_playlists["afternoon"] = {
                    "title": f"Chiều Mưa Kissaten ({day_name}) 🌧️",
                    "story_title": "Cửa Gỗ Sồi Và Mùi Hương Cà Phê Mộc",
                    "story": "Tiếng mưa rào rơi trên hiên gỗ quán Kissaten. Giai điệu Showa Jazz ấm áp cất lên bên tách cà phê phin gỗ, đưa bé cưng vào giấc ngủ trưa êm ái.",
                    "intro": f"Tina chào cả nhà nhé! Chiều nay trời đang [thời tiết]. Ghé vào quán nhỏ Kissaten của Tina, trốn cơn mưa trưa và cùng nghe những giai điệu Showa Jazz mộc mạc nhé... 🐾",
                    "tracks": selected_ids
                }
            else: # evening
                day_playlists["evening"] = {
                    "title": f"Bedtime Iyashikei ({day_name}) 🧸",
                    "story_title": "Đom Đóm Bay Qua Cửa Sổ Tròn",
                    "story": "Ánh đèn ấm áp soi bóng bé cưng nằm ngoan. Giai điệu lofi/piano cover Iyashikei đưa cô/chú và các bạn đồng Meo vào thế giới mộng mơ đầy phép màu.",
                    "intro": f"Tối muộn rồi cô/chú ơi, trời có vẻ [thời tiết] hơn rồi. Cùng bé cưng đắp chiếc chăn mỏng, nghe bản nhạc lofi/piano êm dịu này và chìm vào giấc ngủ ngon nhé... 🐾",
                    "tracks": selected_ids
                }
        else: # western
            if slot == "morning":
                day_playlists["morning"] = {
                    "title": f"Nắng Sớm Bên Hiên ({day_name}) ☕",
                    "story_title": "Tách Trà Sớm Và Tiếng Đuôi Gõ Nhịp",
                    "story": "Hạt nắng sớm len qua ô cửa đánh thức bé cưng. Ly trà ấm hòa cùng tiếng saxo rộn rã đầu ngày, nạp đầy năng lượng thảnh thơi cho cô/chú và các bạn đồng Meo.",
                    "intro": f"Chào cô/chú nhé! Sớm hôm nay thật [thời tiết] đúng không? Tina đã dọn sẵn chiếc ghế bành đón nắng để cả nhà cùng lắng nghe những nốt swing dịu ngọt đầu ngày này... 🐾",
                    "tracks": selected_ids
                }
            elif slot == "afternoon":
                day_playlists["afternoon"] = {
                    "title": f"Góc Khuất Bình Yên ({day_name}) 🍃",
                    "story_title": "Nắng Trưa Đậu Trên Bộ Lông Khô Ráo",
                    "story": "Mặt trời lên cao, bé cưng lười biếng nằm góc cửa sổ mát rượi. Tiếng kèn trumpet êm đềm như dải lụa đưa bé cưng chìm vào giấc ngủ trưa yên ả.",
                    "intro": f"Tina chào cả nhà nhé! Trời trưa nay đang [thời tiết], cô/chú đã nghỉ ngơi chưa nhỉ? Ghé lại góc nhỏ quen thuộc này, tựa lưng thật êm và thả hồn vào những thanh âm mộc mạc trưa nay nhé... 🐾",
                    "tracks": selected_ids
                }
            else: # evening
                day_playlists["evening"] = {
                    "title": f"Đèn Vàng Vĩ Tuyến ({day_name}) 🌙",
                    "story_title": "Đèn Đêm Vàng Và Giấc Mộng Màu Xanh",
                    "story": "Phòng nhỏ lên đèn vàng ấm áp. Bé cưng cuộn tròn dưới chân cô/chú, khẽ vẫy đuôi theo giai điệu jazz sâu lắng. Khép lại một ngày bình yên.",
                    "intro": f"Cô/chú ơi, buổi tối có chút [thời tiết] rồi đấy. Tina đã nhóm sẵn chút tinh dầu quế ấm áp, cùng bé cưng cuộn tròn trên thảm nghe bản jazz êm đềm cuối ngày này và gác lại mọi âu lo thôi nào... 🐾",
                    "tracks": selected_ids
                }
                
    return day_playlists

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    env_path = os.path.join(project_root, '.env')
    print(f"Loading environment variables from: {env_path}")
    env = load_env(env_path)
    
    supabase_url = os.environ.get('PUBLIC_SUPABASE_URL') or env.get('PUBLIC_SUPABASE_URL')
    supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or env.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('PUBLIC_SUPABASE_ANON_KEY') or env.get('PUBLIC_SUPABASE_ANON_KEY')
    
    if not supabase_url or not supabase_key:
        print("Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined.", file=sys.stderr)
        sys.exit(1)
        
    bucket_name = 'audio'
    
    # 1. Read seeds from Git
    seeds_path = os.path.join(script_dir, 'curated_seeds.json')
    if not os.path.exists(seeds_path):
        print(f"Error: {seeds_path} not found.", file=sys.stderr)
        sys.exit(1)
        
    with open(seeds_path, 'r', encoding='utf-8') as f:
        curated_seeds = json.load(f)
        
    # Map seed details
    seed_slots = {s["id"]: s.get("slot", "morning") for s in curated_seeds}
    seed_cultures = {s["id"]: s.get("culture", "western") for s in curated_seeds}
    
    # 2. Wipe storage bucket clean
    delete_all_files(supabase_url, supabase_key, bucket_name)
    
    playlist_tracks = []
    
    # 3. Synchronously download and upload all 50 tracks
    print(f"\nStarting fresh download of {len(curated_seeds)} curated seeds...")
    
    for idx, seed in enumerate(curated_seeds, 1):
        track_id = seed["id"]
        file_title = seed["file"]
        track_title = seed["title"]
        artist = seed["artist"]
        ext = os.path.splitext(file_title)[1].lower()
        
        print(f"\n[{idx}/{len(curated_seeds)}] Processing: {track_title} ({artist})")
        
        # Query Commons
        info_url = f"https://commons.wikimedia.org/w/api.php?action=query&titles={urllib.parse.quote(file_title)}&prop=imageinfo&iiprop=url|size&format=json"
        info_data = query_commons(info_url)
        
        if not info_data or 'query' not in info_data or 'pages' not in info_data['query']:
            print(f"  Failed to get track info for {track_id}")
            continue
            
        pages = info_data['query']['pages']
        page_id = list(pages.keys())[0]
        
        if page_id == '-1' or 'imageinfo' not in pages[page_id] or not pages[page_id]['imageinfo']:
            print(f"  Track details not found for {track_id}")
            continue
            
        img_info = pages[page_id]['imageinfo'][0]
        download_url = img_info['url']
        duration = int(img_info.get('duration', 180))
        
        print(f"  Download URL: {download_url}")
        print(f"  Duration: {duration}s")
        
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as temp_file:
            temp_path = temp_file.name
            
        print("  Downloading...")
        if download_file(download_url, temp_path):
            clean_filename = re.sub(r'[^a-zA-Z0-9._-]', '_', file_title.replace("File:", ""))
            print(f"  Uploading as: {clean_filename} ...")
            
            status, response = upload_to_supabase(supabase_url, supabase_key, bucket_name, clean_filename, temp_path)
            
            try:
                os.remove(temp_path)
            except OSError:
                pass
                
            if status == 200:
                print("  Upload successful!")
                public_url = f"{supabase_url}/storage/v1/object/public/{bucket_name}/{clean_filename}"
                playlist_tracks.append({
                    "id": track_id,
                    "title": track_title,
                    "artist": artist,
                    "url": public_url,
                    "duration": duration,
                    "filename": clean_filename
                })
            else:
                print(f"  Upload failed with status {status}.")
        else:
            print("  Download failed.")
            try:
                os.remove(temp_path)
            except OSError:
                pass
                
    print(f"\nSuccessfully synced {len(playlist_tracks)} tracks to Supabase.")
    
    # 4. Generate playlists for all 7 days of the week
    playlists = {}
    for d in range(7):
        playlists[str(d)] = generate_playlist_for_day(d, playlist_tracks, seed_slots, seed_cultures)
        
    playlist_data = {
        "tracks": playlist_tracks,
        "playlists": playlists
    }
    
    # 5. Upload final playlist.json to Supabase
    with tempfile.NamedTemporaryFile(suffix='.json', mode='w', encoding='utf-8', delete=False) as temp_json:
        json.dump(playlist_data, temp_json, indent=2, ensure_ascii=False)
        temp_json_path = temp_json.name
        
    print("\nUploading final playlist.json to Supabase...")
    status, response = upload_to_supabase(supabase_url, supabase_key, bucket_name, 'playlist.json', temp_json_path)
    
    try:
        os.remove(temp_json_path)
    except OSError:
        pass
        
    if status == 200:
        print("\n=== CLEAN AND SYNC COMPLETED SUCCESSFULLY ===")
        print(f"Uploaded {len(playlist_tracks)} audio files and refreshed playlist.json.")
    else:
        print(f"\nError uploading playlist.json. Status: {status}. Response: {response}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
