import requests
import json

url = "http://localhost:8000/api/generate"
params = {"wait": "false"}
payload = {
    "positive_prompt": "a futuristic cityscape at night, neon lights, 8k resolution",
    "steps": 9,
    "cfg": 1.0
}
headers = {"Content-Type": "application/json"}

try:
    response = requests.post(url, params=params, json=payload, headers=headers)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
except Exception as e:
    print(f"Error: {e}")
