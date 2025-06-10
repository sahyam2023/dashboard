from flask_apscheduler import APScheduler
import sqlite3
import os
from datetime import datetime, timedelta
from flask import current_app # To access app.config for DB path and retention period

# Initialize scheduler
scheduler = APScheduler()

def init_scheduler(app):
    """Initialize and start the scheduler."""
    scheduler.init_app(app)
    scheduler.start()
    print("Scheduler initialized and started.")

    # Ensure delete_old_messages_task is defined or imported before this line
    if not scheduler.get_job('Delete Old Messages'):
        scheduler.add_job(id='Delete Old Messages', func=delete_old_messages_task, trigger='interval', days=1)
        print("Scheduled 'Delete Old Messages' job to run daily.")
    else:
        print("'Delete Old Messages' job already scheduled.")

def delete_old_messages_task():
    print("Running delete_old_messages_task...")
    try:
        # Construct the full path to the database file
        # Assuming the 'instance' folder is at the same level as the script running Flask (app.py)
        # and app.config['DATABASE_PATH'] stores 'instance/software_dashboard.db'
        db_path = current_app.config['DATABASE_PATH']
        
        # Ensure the path is absolute if it's not already
        if not os.path.isabs(db_path):
            # Assuming app.py is in the root, and instance folder is relative to it
            # This might need adjustment based on your project structure if current_app.root_path is different
            db_path = os.path.join(current_app.root_path, db_path)

        print(f"Connecting to database at: {db_path}")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Get retention period from app config, default to 180 days if not set
        retention_days = current_app.config.get('MESSAGE_RETENTION_DAYS', 180)
        print(f"Using message retention period of {retention_days} days.")
        cutoff_date = datetime.now() - timedelta(days=int(retention_days))
        cutoff_timestamp = cutoff_date.strftime('%Y-%m-%d %H:%M:%S')

        print(f"Deleting messages older than: {cutoff_timestamp}")
        
        # Delete old messages
        # The 'created_at' column in 'messages' table is expected to be in 'YYYY-MM-DD HH:MM:SS' format
        cursor.execute("DELETE FROM messages WHERE created_at < ?", (cutoff_timestamp,))
        conn.commit()
        
        deleted_count = cursor.rowcount
        print(f"Successfully deleted {deleted_count} old messages.")

    except sqlite3.Error as e:
        print(f"Database error in delete_old_messages_task: {e}")
    except Exception as e:
        print(f"An unexpected error occurred in delete_old_messages_task: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()
        print("delete_old_messages_task finished.")
