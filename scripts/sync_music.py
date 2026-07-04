#!/usr/bin/env python3
import os
import json
import urllib.request
import urllib.parse
import sys
import re
import tempfile

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

def create_bucket_if_not_exists(sb_url, sb_key, bucket):
    check_url = f"{sb_url}/storage/v1/bucket/{bucket}"
    req = urllib.request.Request(
        check_url,
        headers={
            'apikey': sb_key,
            'Authorization': f'Bearer {sb_key}'
        }
    )
    try:
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                print(f"Bucket '{bucket}' already exists and is accessible.")
                return True
    except Exception:
        pass
    
    # Try to create it
    create_url = f"{sb_url}/storage/v1/bucket"
    body = json.dumps({"id": bucket, "name": bucket, "public": True}).encode('utf-8')
    req = urllib.request.Request(
        create_url,
        data=body,
        headers={
            'apikey': sb_key,
            'Authorization': f'Bearer {sb_key}',
            'Content-Type': 'application/json'
        },
        method='POST'
    )
    try:
        with urllib.request.urlopen(req) as response:
            print(f"Successfully created public storage bucket '{bucket}'.")
            return True
    except Exception as e:
        print(f"Could not create bucket '{bucket}' programmatically: {e}")
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

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    env_path = os.path.join(project_root, '.env')
    
    print(f"Loading environment variables from: {env_path}")
    env = load_env(env_path)
    
    supabase_url = env.get('PUBLIC_SUPABASE_URL')
    supabase_key = env.get('SUPABASE_SERVICE_ROLE_KEY') or env.get('PUBLIC_SUPABASE_ANON_KEY')
    
    if not supabase_url or not supabase_key:
        print("Error: PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be defined in your .env file.", file=sys.stderr)
        sys.exit(1)
        
    bucket_name = 'audio'
    
    # 1. Create storage bucket if not exists
    create_bucket_if_not_exists(supabase_url, supabase_key, bucket_name)
    
    # 2. Curated tracks library (50 tracks - high-quality studio files, no old crackly vinyls)
    curated_tracks = [
        {"id": "stardust", "file": "File:US Army Blues - 05 - Stardust.ogg", "title": "Stardust 🌟", "artist": "U.S. Army Blues"},
        {"id": "everyday", "file": "File:Everyday Adventures - Airmen of Note - United States Air Force Band.mp3", "title": "Everyday Adventures 🚲", "artist": "The Airmen of Note"},
        {"id": "hickory", "file": "File:Hickory and Twine - Airmen of Note - United States Air Force Band.mp3", "title": "Hickory and Twine 🍃", "artist": "The Airmen of Note"},
        {"id": "barbara", "file": "File:US Army Blues - 09 - Barbara.ogg", "title": "Barbara 🌸", "artist": "U.S. Army Blues"},
        {"id": "bayou", "file": "File:US Army Blues - 07 - Bayou Farewell.ogg", "title": "Bayou Farewell 🛶", "artist": "U.S. Army Blues"},
        {"id": "mainstem", "file": "File:US Army Blues - 02 - Main Stem.ogg", "title": "Main Stem 🎷", "artist": "U.S. Army Blues"},
        {"id": "walkdog", "file": "File:US Army Blues - 11 - Walk That Dog.ogg", "title": "Walk That Dog 🐕", "artist": "U.S. Army Blues"},
        {"id": "christmas", "file": "File:01-The Airmen of Note-Christmas Time is Here-Good King Wenceslas and His Merry Band.mp3", "title": "Christmas Time is Here ❄️", "artist": "The Airmen of Note"},
        {"id": "amazing", "file": "File:Amazing Grace (USAFB jazz vocal).ogg", "title": "Amazing Grace ✨", "artist": "The Airmen of Note"},
        {"id": "intensities", "file": "File:Intensities in Ten Cities - Airmen of Note - United States Air Force Band.mp3", "title": "Intensities in Ten Cities 🏙️", "artist": "The Airmen of Note"},
        # 40 New High-Quality Studio Tracks
        {"id": "smallnote", "file": "File:Small Note Boogaloo - Airmen of Note - United States Air Force Band.mp3", "title": "Small Note Boogaloo 🎷", "artist": "The Airmen of Note"},
        {"id": "skyscrapers", "file": "File:Skyscrapers - Airmen of Note - United States Air Force Band.mp3", "title": "Skyscrapers 🏙️", "artist": "The Airmen of Note"},
        {"id": "convergence", "file": "File:Convergence - Airmen of Note - United States Air Force Band.mp3", "title": "Convergence 🎼", "artist": "The Airmen of Note"},
        {"id": "unomas", "file": "File:Uno Mas - Airmen of Note - United States Air Force Band.mp3", "title": "Uno Mas 🎺", "artist": "The Airmen of Note"},
        {"id": "underground", "file": "File:Underground - Airmen of Note - United States Air Force Band.mp3", "title": "Underground 🚇", "artist": "The Airmen of Note"},
        {"id": "bluesmundy", "file": "File:Blues for Mundy - Airmen of Note - United States Air Force Band.mp3", "title": "Blues for Mundy 🎷", "artist": "The Airmen of Note"},
        {"id": "sunkindars", "file": "File:Sunk in Dars - Airmen of Note - United States Air Force Band.mp3", "title": "Sunk in Dars 🌊", "artist": "The Airmen of Note"},
        {"id": "sakura", "file": "File:Sakura - Airmen of Note - United States Air Force Band.mp3", "title": "Sakura 🌸", "artist": "The Airmen of Note"},
        {"id": "arirang", "file": "File:Arirang - Airmen of Note - United States Air Force Band.mp3", "title": "Arirang 🌾", "artist": "The Airmen of Note"},
        {"id": "trombone", "file": "File:Trombone Detritus - Airmen of Note - United States Air Force Band.mp3", "title": "Trombone Detritus 🎺", "artist": "The Airmen of Note"},
        {"id": "eagleeyes", "file": "File:Eagle Eyes - Airmen of Note - United States Air Force Band.mp3", "title": "Eagle Eyes 🦅", "artist": "The Airmen of Note"},
        {"id": "sheridan", "file": "File:Sheridan Square - Airmen of Note - United States Air Force Band.mp3", "title": "Sheridan Square 🏣", "artist": "The Airmen of Note"},
        {"id": "brandnewday", "file": "File:It's a Brand New Day - Airmen of Note - United States Air Force Band.mp3", "title": "A Brand New Day ☀️", "artist": "The Airmen of Note"},
        {"id": "stoleback", "file": "File:Stole Back My Soul - Airmen of Note - United States Air Force Band.mp3", "title": "Stole Back My Soul 🎸", "artist": "The Airmen of Note"},
        {"id": "littledreamer", "file": "File:Little Dreamer, Big Dreams - Airmen of Note - United States Air Force Band.mp3", "title": "Little Dreamer 🧸", "artist": "The Airmen of Note"},
        {"id": "reuniondues", "file": "File:USAF Band Reunion Dues.ogg", "title": "Reunion Dues 🎷", "artist": "The Airmen of Note"},
        {"id": "auldlang", "file": "File:Auld Lang Cha Cha Cha.ogg", "title": "Auld Lang Cha Cha 💃", "artist": "The Airmen of Note"},
        {"id": "oginiland", "file": "File:US Army Blues - 06 - Oginiland.ogg", "title": "Oginiland 🗺️", "artist": "U.S. Army Blues"},
        {"id": "bugablue", "file": "File:US Army Blues - 10 - BugaBlue.ogg", "title": "BugaBlue 🎺", "artist": "U.S. Army Blues"},
        {"id": "kellis", "file": "File:US Army Blues - 08 - Kellis Number.ogg", "title": "Kellis Number 🔢", "artist": "U.S. Army Blues"},
        {"id": "notonbus", "file": "File:US Army Blues - 04 - Not On The Bus.ogg", "title": "Not On The Bus 🚌", "artist": "U.S. Army Blues"},
        {"id": "stargazer", "file": "File:US Army Blues - 03 - Dance Of The Stargazer.ogg", "title": "Dance of the Stargazer 🌌", "artist": "U.S. Army Blues"},
        {"id": "acidjazz", "file": "File:Kevin MacLeod - AcidJazz.ogg", "title": "Acid Jazz ☕", "artist": "Kevin MacLeod"},
        {"id": "fasterdoesit", "file": "File:Kevin MacLeod - Faster Does It.ogg", "title": "Faster Does It 🚲", "artist": "Kevin MacLeod"},
        {"id": "dancesdames", "file": "File:Kevin MacLeod - Dances and Dames.ogg", "title": "Dances and Dames 💃", "artist": "Kevin MacLeod"},
        {"id": "offtoosaka", "file": "File:Kevin MacLeod - Off to Osaka.ogg", "title": "Off to Osaka 🚄", "artist": "Kevin MacLeod"},
        {"id": "iknewguy", "file": "File:Kevin MacLeod - I Knew a Guy.ogg", "title": "I Knew a Guy 🕵️", "artist": "Kevin MacLeod"},
        {"id": "asifigure", "file": "File:Kevin MacLeod - As I Figure.ogg", "title": "As I Figure 📐", "artist": "Kevin MacLeod"},
        {"id": "backedvibes", "file": "File:Kevin MacLeod - Backed Vibes Clean.ogg", "title": "Backed Vibes 🍃", "artist": "Kevin MacLeod"},
        {"id": "vibeace", "file": "File:Kevin MacLeod - Vibe Ace.ogg", "title": "Vibe Ace 🎹", "artist": "Kevin MacLeod"},
        {"id": "nightdocks", "file": "File:Kevin MacLeod - Night on the Docks - Sax.ogg", "title": "Night on the Docks 🎷", "artist": "Kevin MacLeod"},
        {"id": "koolkats", "file": "File:Kool Kats (MacLeod, Kevin) (ISRC USUAN1100601).oga", "title": "Kool Kats 🐈", "artist": "Kevin MacLeod"},
        {"id": "studyrelax", "file": "File:Study And Relax by Kevin MacLeod.ogg", "title": "Study And Relax 📖", "artist": "Kevin MacLeod"},
        {"id": "jazzbrunch", "file": "File:Jazz Brunch (ISRC USUAN1700074).mp3", "title": "Jazz Brunch 🥞", "artist": "Kevin MacLeod"},
        {"id": "modernsamba", "file": "File:Modern Jazz Samba (ISRC USUAN1100153).mp3", "title": "Modern Jazz Samba 🌴", "artist": "Kevin MacLeod"},
        {"id": "longstroll", "file": "File:Long Stroll (ISRC USUAN1100174).mp3", "title": "Long Stroll 🚶", "artist": "Kevin MacLeod"},
        {"id": "coolvibes", "file": "File:Cool Vibes (ISRC USUAN1100863).mp3", "title": "Cool Vibes 😎", "artist": "Kevin MacLeod"},
        {"id": "lobbytime", "file": "File:Lobby Time (ISRC USUAN1600054).mp3", "title": "Lobby Time ⏳", "artist": "Kevin MacLeod"},
        {"id": "bossaantigua", "file": "File:Bossa Antigua (ISRC USUAN1700069).mp3", "title": "Bossa Antigua 🍃", "artist": "Kevin MacLeod"},
        {"id": "groovegrove", "file": "File:Groove Grove (ISRC USUAN1200054).mp3", "title": "Groove Grove 🌲", "artist": "Kevin MacLeod"}
    ]
    
    # 3. Generate 3 slots for each day (0-6)
    day_names = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"]
    playlists = {}
    
    # Mood-based sub-pools matching the criteria
    morning_pool = [
        "everyday", "hickory", "smallnote", "skyscrapers", "convergence", "unomas", 
        "underground", "bluesmundy", "sunkindars", "sakura", "arirang", "trombone", 
        "eagleeyes", "sheridan", "brandnewday", "stoleback", "littledreamer"
    ]
    afternoon_pool = [
        "walkdog", "bayou", "barbara", "oginiland", "bugablue", "kellis", 
        "notonbus", "stargazer", "fasterdoesit", "dancesdames", "offtoosaka", 
        "iknewguy", "backedvibes", "vibeace", "jazzbrunch", "modernsamba", "longstroll"
    ]
    evening_pool = [
        "christmas", "amazing", "intensities", "stardust", "reuniondues", "auldlang", 
        "acidjazz", "asifigure", "nightdocks", "koolkats", "studyrelax", "coolvibes", 
        "lobbytime", "bossaantigua", "groovegrove", "mainstem"
    ]
    
    for day in range(7):
        day_str = str(day)
        day_name = day_names[day]
        
        # Select 10 tracks for each slot dynamically based on the day index
        m_start = (day * 2) % len(morning_pool)
        morning_tracks = [morning_pool[(m_start + i) % len(morning_pool)] for i in range(10)]
        
        a_start = (day * 2) % len(afternoon_pool)
        afternoon_tracks = [afternoon_pool[(a_start + i) % len(afternoon_pool)] for i in range(10)]
        
        e_start = (day * 2) % len(evening_pool)
        evening_tracks = [evening_pool[(e_start + i) % len(evening_pool)] for i in range(10)]
        
        playlists[day_str] = {
            "morning": {
                "title": f"Nắng Sớm Bên Hiên ({day_name}) ☕",
                "story_title": "Tách Trà Sớm Và Tiếng Đuôi Gõ Nhịp",
                "story": "Hạt nắng sớm len qua ô cửa đánh thức bé cưng. Ly trà ấm hòa cùng tiếng saxo rộn rã đầu ngày, nạp đầy năng lượng thảnh thơi cho cô/chú và các bạn đồng Meo.",
                "intro": f"Chào cô/chú nhé! Sớm hôm nay ở khu vực nhà con thật [thời tiết] đúng không? Tina đã dọn sẵn chiếc ghế bành đón nắng để cả nhà cùng lắng nghe những nốt swing dịu ngọt đầu ngày này... 🐾",
                "tracks": morning_tracks
            },
            "afternoon": {
                "title": f"Góc Khuất Bình Yên ({day_name}) 🍃",
                "story_title": "Nắng Trưa Đậu Trên Bộ Lông Khô Ráo",
                "story": "Mặt trời lên cao, bé cưng lười biếng nằm góc cửa sổ mát rượi. Tiếng kèn trumpet êm đềm như dải lụa đưa bé cưng chìm vào giấc ngủ trưa yên ả.",
                "intro": f"Tina chào cả nhà nhé! Tiết trời trưa nay tại khu vực nhà con đang [thời tiết], cô/chú đã nghỉ ngơi chưa nhỉ? Ghé lại góc nhỏ quen thuộc này, tựa lưng thật êm và thả hồn vào những thanh âm mộc mạc trưa nay nhé... 🐾",
                "tracks": afternoon_tracks
            },
            "evening": {
                "title": f"Đèn Vàng Vĩ Tuyến ({day_name}) 🌙",
                "story_title": "Đèn Đêm Vàng Và Giấc Mộng Màu Xanh",
                "story": "Phòng nhỏ lên đèn vàng ấm áp. Bé cưng cuộn tròn dưới chân cô/chú, khẽ vẫy đuôi theo giai điệu jazz sâu lắng. Khép lại một ngày bình yên.",
                "intro": f"Cô/chú ơi, buổi tối khu vực nhà con có chút [thời tiết] rồi đấy. Tina đã nhóm sẵn chút tinh dầu quế ấm áp, cùng bé cưng cuộn tròn trên thảm nghe bản jazz êm đềm cuối ngày này và gác lại mọi âu lo thôi nào... 🐾",
                "tracks": evening_tracks
            }
        }
        
    print(f"Processing {len(curated_tracks)} curated cozy jazz tracks...")
    playlist_tracks = []
    
    for idx, track_info in enumerate(curated_tracks):
        track_id = track_info["id"]
        file_title = track_info["file"]
        track_title = track_info["title"]
        artist = track_info["artist"]
        
        ext = os.path.splitext(file_title)[1].lower()
        
        print(f"\nProcessing track {idx + 1}/{len(curated_tracks)}: {file_title}")
        
        info_url = f"https://commons.wikimedia.org/w/api.php?action=query&titles={urllib.parse.quote(file_title)}&prop=imageinfo&iiprop=url|size&format=json"
        info_data = query_commons(info_url)
        
        if not info_data or 'query' not in info_data or 'pages' not in info_data['query']:
            print("  Skipping: Failed to get track info.")
            continue
            
        pages = info_data['query']['pages']
        page_id = list(pages.keys())[0]
        
        if page_id == '-1' or 'imageinfo' not in pages[page_id] or not pages[page_id]['imageinfo']:
            print("  Skipping: Track details not found.")
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
            else:
                print(f"  Upload failed with status {status}. Response: {response}")
        else:
            print("  Download failed.")
            try:
                os.remove(temp_path)
            except OSError:
                pass
                
    if not playlist_tracks:
        print("\nError: No tracks were successfully synced.", file=sys.stderr)
        sys.exit(1)
        
    print(f"\nSuccessfully synced {len(playlist_tracks)} tracks to Supabase.")
    
    # 4. Generate final output with both tracks library and playlists config
    playlist_data = {
        "tracks": playlist_tracks,
        "playlists": playlists
    }
    
    with tempfile.NamedTemporaryFile(suffix='.json', mode='w', encoding='utf-8', delete=False) as temp_json:
        json.dump(playlist_data, temp_json, indent=2, ensure_ascii=False)
        temp_json_path = temp_json.name
        
    print("Uploading playlist.json to Supabase...")
    status, response = upload_to_supabase(supabase_url, supabase_key, bucket_name, 'playlist.json', temp_json_path)
    
    try:
        os.remove(temp_json_path)
    except OSError:
        pass
        
    if status == 200:
        print("\n=== SYNC COMPLETED SUCCESSFULLY ===")
        print(f"Playlist JSON URL: {supabase_url}/storage/v1/object/public/{bucket_name}/playlist.json")
    else:
        print(f"\nError: Failed to upload playlist.json. Status: {status}. Response: {response}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
