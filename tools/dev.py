"""本地调试：python tools/dev.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import app
app.run(host='127.0.0.1', port=5057, threaded=True)
