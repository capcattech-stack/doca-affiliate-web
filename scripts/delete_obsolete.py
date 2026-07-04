#!/usr/bin/env python3
import os
import json
import urllib.request
import urllib.parse
import re
import sys

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

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    env_path = os.path.join(project_root, '.env')
    env = load_env(env_path)
    
    supabase_url = os.environ.get('PUBLIC_SUPABASE_URL') or env.get('PUBLIC_SUPABASE_URL')
    supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or env.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('PUBLIC_SUPABASE_ANON_KEY') or env.get('PUBLIC_SUPABASE_ANON_KEY')
    bucket = 'audio'
    
    if not supabase_url or not supabase_key:
        print("Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined.", file=sys.stderr)
        sys.exit(1)
        
    # 1. Load curated filenames
    seeds_path = os.path.join(script_dir, 'curated_seeds.json')
    if not os.path.exists(seeds_path):
        print(f"Error: {seeds_path} not found.", file=sys.stderr)
        sys.exit(1)
        
    with open(seeds_path, 'r', encoding='utf-8') as f:
        seeds = json.load(f)
        
    curated_filenames = set()
    for s in seeds:
        clean_name = re.sub(r'[^a-zA-Z0-9._-]', '_', s["file"].replace("File:", ""))
        curated_filenames.add(clean_name)
        
    # Add playlist.json to the list of allowed files
    curated_filenames.add("playlist.json")
    
    # 2. List files in bucket
    list_url = f"{supabase_url}/storage/v1/object/list/{bucket}"
    payload = {"prefix": "", "limit": 500}
    req = urllib.request.Request(
        list_url,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'apikey': supabase_key,
            'Authorization': f'Bearer {supabase_key}',
            'Content-Type': 'application/json'
        },
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            files = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error listing files in Supabase: {e}", file=sys.stderr)
        return
        
    all_remote_files = [f["name"] for f in files]
    obsolete_files = [name for name in all_remote_files if name not in curated_filenames and name != ".keep"]
    
    if not obsolete_files:
        print("No obsolete files found in Supabase Storage. Bucket is already clean!")
        return
        
    print(f"Found {len(obsolete_files)} obsolete files to delete: {obsolete_files}")
    
    # 3. Delete obsolete files
    del_url = f"{supabase_url}/storage/v1/object/{bucket}"
    req2 = urllib.request.Request(
        del_url,
        data=json.dumps({"prefixes": obsolete_files}).encode('utf-8'),
        headers={
            'apikey': supabase_key,
            'Authorization': f'Bearer {supabase_key}',
            'Content-Type': 'application/json'
        },
        method='DELETE'
    )
    try:
        with urllib.request.urlopen(req2) as response:
            print("Successfully deleted obsolete files!")
    except Exception as e:
        print(f"Error deleting files: {e}", file=sys.stderr)

if __name__ == '__main__':
    main()
