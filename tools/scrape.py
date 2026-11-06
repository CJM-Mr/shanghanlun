import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def P(*a): return os.path.join(ROOT, *a)
import os, time, requests
BASE='https://mmkat.com/book/shanghan-zabing-lun'
H={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}
os.makedirs(P('data/raw'),exist_ok=True)
s=requests.Session(); s.headers.update(H)
for i in range(1,35):
    p=P(f'data/raw/{i}.html')
    if os.path.exists(p) and os.path.getsize(p)>2000: continue
    for attempt in range(3):
        try:
            r=s.get(f'{BASE}/{i}.html',timeout=40)
            if r.status_code==200 and len(r.text)>2000:
                r.encoding=r.apparent_encoding if not r.encoding else r.encoding
                open(p,'w',encoding='utf-8').write(r.text)
                print(i,len(r.text),flush=True); break
        except Exception as e:
            print(i,'retry',e,flush=True); time.sleep(2)
    time.sleep(0.8)
print('done')
