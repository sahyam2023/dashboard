# hooks/rthook_eventlet.py
# 1. Manually import the green versions of the most problematic modules.
from eventlet.green import thread, threading, time

# 2. Forcefully overwrite the entries in Python's module cache.
#    This ensures that any subsequent import of 'threading' gets our green version.
import sys
sys.modules['thread'] = thread
sys.modules['threading'] = threading
sys.modules['time'] = time

# 3. Now, import eventlet and run the main patch.
#    We tell it to NOT patch 'thread' and 'time' since we just did that manually.
#    This allows it to patch everything else (socket, os, select, etc.).
import eventlet
eventlet.monkey_patch(thread=False, time=False)

# 4. Set the environment variable so the main app doesn't try to patch again.
import os
os.environ['EVENTLET_PATCHED'] = '1'

