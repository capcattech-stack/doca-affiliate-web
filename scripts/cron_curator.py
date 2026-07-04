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

def fetch_current_playlist(sb_url):
    url = f"{sb_url}/storage/v1/object/public/audio/playlist.json"
    req = urllib.request.Request(url, headers={'User-Agent': 'DOCABot/1.0'})
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception:
        # File doesn't exist yet
        return None

def generate_playlist_for_day(day_idx, playlist_tracks, seed_slots, seed_cultures):
    day_names = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"]
    day_name = day_names[day_idx]
    
    # 0: Sunday -> Western
    # 1: Monday -> Western
    # 2: Tuesday -> Japanese
    # 3: Wednesday -> Western
    # 4: Thursday -> Japanese
    # 5: Friday -> Western
    # 6: Saturday -> Japanese
    culture = "japanese" if day_idx in [2, 4, 6] else "western"
    day_playlists = {}
    
    for slot in ["morning", "afternoon", "evening"]:
        # Filter tracks by slot and culture
        slot_tracks = [t for t in playlist_tracks if seed_slots.get(t["id"]) == slot and seed_cultures.get(t["id"]) == culture]
        
        if not slot_tracks:
            # Fallback if no tracks in this culture/slot yet (gracefully pull from general slot tracks)
            slot_tracks = [t for t in playlist_tracks if seed_slots.get(t["id"]) == slot]
            
        if len(slot_tracks) <= 10:
            selected_ids = [t["id"] for t in slot_tracks]
        else:
            # 50/50 mix: 5 newest added tracks, 5 older tracks
            newest_pool = slot_tracks[-5:]
            older_pool = slot_tracks[:-5]
            
            newest_ids = [t["id"] for t in newest_pool]
            
            o_start = (day_idx * 2) % len(older_pool)
            older_ids = [older_pool[(o_start + i) % len(older_pool)]["id"] for i in range(5)]
            
            selected_ids = newest_ids + older_ids
            
        # Define stories and templates depending on culture
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
    
    # 2. Fetch current playlist from Supabase Storage
    current_playlist_data = fetch_current_playlist(supabase_url)
    
    if current_playlist_data and "tracks" in current_playlist_data:
        playlist_tracks = current_playlist_data["tracks"]
        playlists = current_playlist_data.get("playlists", {})
        print(f"Fetched existing playlist.json containing {len(playlist_tracks)} tracks.")
    else:
        playlist_tracks = []
        playlists = {}
        print("No existing playlist.json found. Initializing.")
        
    downloaded_ids = {t["id"] for t in playlist_tracks}
    
    # Group seeds by slot
    seeds_by_slot = {"morning": [], "afternoon": [], "evening": []}
    for seed in curated_seeds:
        slot = seed.get("slot", "morning")
        if slot in seeds_by_slot:
            seeds_by_slot[slot].append(seed)
            
    # 3. Curation phase: download at most 1 new track per slot during this cron run
    new_downloads_count = 0
    for slot, seeds in seeds_by_slot.items():
        unsynced_seed = None
        for seed in seeds:
            if seed["id"] not in downloaded_ids:
                unsynced_seed = seed
                break
                
        if unsynced_seed:
            track_id = unsynced_seed["id"]
            file_title = unsynced_seed["file"]
            track_title = unsynced_seed["title"]
            artist = unsynced_seed["artist"]
            ext = os.path.splitext(file_title)[1].lower()
            
            print(f"\n[Cron] Found new unsynced track for {slot} slot: {track_title}")
            
            # Query Commons
            info_url = f"https://commons.wikimedia.org/w/api.php?action=query&titles={urllib.parse.quote(file_title)}&prop=imageinfo&iiprop=url|size&format=json"
            info_data = query_commons(info_url)
            
            if not info_data or 'query' not in info_data or 'pages' not in info_data['query']:
                print(f"  Skipping: Failed to get track info for {track_id}")
                continue
                
            pages = info_data['query']['pages']
            page_id = list(pages.keys())[0]
            
            if page_id == '-1' or 'imageinfo' not in pages[page_id] or not pages[page_id]['imageinfo']:
                print(f"  Skipping: Track details not found for {track_id}")
                continue
                
            img_info = pages[page_id]['imageinfo'][0]
            download_url = img_info['url']
            duration = int(img_info.get('duration', 180))
            
            print(f"  Download URL: {download_url}")
            print(f"  Duration: {duration}s")
            
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as temp_file:
                temp_path = temp_file.name
                
            print("  Downloading file...")
            if download_file(download_url, temp_path):
                clean_filename = re.sub(r'[^a-zA-Z0-9._-]', '_', file_title.replace("File:", ""))
                print(f"  Uploading to Supabase Storage as: {clean_filename} ...")
                
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
                    new_downloads_count += 1
                else:
                    print(f"  Upload failed with status {status}.")
            else:
                print("  Download failed.")
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
        else:
            print(f"[Cron] All seeds for '{slot}' slot are already synced.")
            
    print(f"\n[Cron] Synced {new_downloads_count} new tracks. Total library: {len(playlist_tracks)} tracks.")
    
    if not playlist_tracks:
        print("Error: No tracks available in library to generate playlists.", file=sys.stderr)
        sys.exit(1)
        
    # Calculate target day for T-2 buffer (in Vietnam local time ICT, which is UTC+7)
    # Target day is tomorrow's tomorrow
    utc_now = datetime.utcnow()
    vietnam_now = utc_now + timedelta(hours=7)
    target_date = vietnam_now + timedelta(days=2)
    target_day_idx = (target_date.weekday() + 1) % 7 # Python weekday is 0 (Mon) to 6 (Sun). Convert to 0 (Sun) to 6 (Sat)
    
    print(f"\n[Cron] Current ICT Time: {vietnam_now.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[Cron] Preparing target day T-2 playlist: {target_date.strftime('%Y-%m-%d')} (Day Index: {target_day_idx})")
    
    # Initialize all days if the structure is completely empty
    for d in range(7):
        d_str = str(d)
        if d_str not in playlists:
            print(f"Initializing playlist structure for Day {d}")
            playlists[d_str] = generate_playlist_for_day(d, playlist_tracks, seed_slots, seed_cultures)
            
    # Always regenerate the target day playlist with the updated database tracks
    target_day_str = str(target_day_idx)
    playlists[target_day_str] = generate_playlist_for_day(target_day_idx, playlist_tracks, seed_slots, seed_cultures)
    print(f"[Cron] Updated and locked T-2 playlist for Day {target_day_idx} ({'Japanese' if target_day_idx in [2, 4, 6] else 'Western'} culture).")
    
    # 5. Save & upload playlist.json
    playlist_data = {
        "tracks": playlist_tracks,
        "playlists": playlists
    }
    
    with tempfile.NamedTemporaryFile(suffix='.json', mode='w', encoding='utf-8', delete=False) as temp_json:
        json.dump(playlist_data, temp_json, indent=2, ensure_ascii=False)
        temp_json_path = temp_json.name
        
    print("\nUploading updated playlist.json to Supabase Storage...")
    status, response = upload_to_supabase(supabase_url, supabase_key, bucket_name, 'playlist.json', temp_json_path)
    
    try:
        os.remove(temp_json_path)
    except OSError:
        pass
        
    if status == 200:
        print("\n=== CRON CURATION COMPLETED SUCCESSFULLY ===")
    else:
        print(f"\nError uploading playlist.json. Status: {status}. Response: {response}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
