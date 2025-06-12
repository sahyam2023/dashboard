from flask_apscheduler import APScheduler
import sqlite3
import os
from datetime import datetime, timedelta
from flask import current_app # To access app.config for DB path and retention period
import logging # For logging within scheduler tasks

# Initialize scheduler
scheduler = APScheduler()
logger = logging.getLogger(__name__) # Standard Python logger for scheduler

def init_scheduler(app):
    """Initialize and start the scheduler."""
    scheduler.init_app(app)
    scheduler.start()
    print("Scheduler initialized and started.")

    # Ensure delete_old_messages_task is defined or imported before this line
    if not scheduler.get_job('Delete Old Messages'):
        scheduler.add_job(id='Delete Old Messages', func=delete_old_messages_task, trigger='interval', days=1)
        logger.info("Scheduled 'Delete Old Messages' job to run daily.")
    else:
        logger.info("'Delete Old Messages' job already scheduled.")

    if not scheduler.get_job('Cleanup Old Temporary Files'):
        # Schedule to run daily at 3 AM
        scheduler.add_job(id='Cleanup Old Temporary Files', func=cleanup_old_temporary_files_task, trigger='cron', hour=3, minute=0)
        logger.info("Scheduled 'Cleanup Old Temporary Files' job to run daily at 3:00 AM.")
    else:
        logger.info("'Cleanup Old Temporary Files' job already scheduled.")

def cleanup_old_temporary_files_task():
    with scheduler.app.app_context():
        logger.info("Running cleanup_old_temporary_files_task...")
        try:
            instance_path = current_app.config.get('INSTANCE_FOLDER_PATH')
            if not instance_path or not os.path.isdir(instance_path):
                logger.error(f"INSTANCE_FOLDER_PATH '{instance_path}' is not defined or not a directory. Skipping cleanup.")
                return

            # 1. Cleanup tmp_standard_uploads
            tmp_standard_uploads_dir = os.path.join(instance_path, 'tmp_standard_uploads')
            if os.path.exists(tmp_standard_uploads_dir):
                logger.info(f"Scanning {tmp_standard_uploads_dir} for old files...")
                cutoff_time = datetime.now() - timedelta(hours=24)
                deleted_standard_count = 0
                for filename in os.listdir(tmp_standard_uploads_dir):
                    file_path = os.path.join(tmp_standard_uploads_dir, filename)
                    try:
                        if os.path.isfile(file_path):
                            file_mod_time = datetime.fromtimestamp(os.path.getmtime(file_path))
                            if file_mod_time < cutoff_time:
                                os.remove(file_path)
                                logger.info(f"Deleted old temporary file: {file_path}")
                                deleted_standard_count += 1
                    except Exception as e_std:
                        logger.error(f"Error processing file {file_path} in tmp_standard_uploads: {e_std}")
                logger.info(f"Cleanup of tmp_standard_uploads complete. Deleted {deleted_standard_count} files.")
            else:
                logger.info(f"Directory {tmp_standard_uploads_dir} does not exist. Skipping cleanup for it.")

            # 2. Cleanup TMP_LARGE_UPLOADS_FOLDER (for .part files)
            tmp_large_uploads_dir = current_app.config.get('TMP_LARGE_UPLOADS_FOLDER') # This is already an absolute path
            if tmp_large_uploads_dir and os.path.exists(tmp_large_uploads_dir):
                logger.info(f"Scanning {tmp_large_uploads_dir} for old .part files...")
                cutoff_time_large = datetime.now() - timedelta(hours=24) # Can use the same or different cutoff
                deleted_large_count = 0
                for filename in os.listdir(tmp_large_uploads_dir):
                    if filename.endswith('.part'):
                        file_path = os.path.join(tmp_large_uploads_dir, filename)
                        try:
                            if os.path.isfile(file_path):
                                file_mod_time = datetime.fromtimestamp(os.path.getmtime(file_path))
                                if file_mod_time < cutoff_time_large:
                                    os.remove(file_path)
                                    logger.info(f"Deleted old temporary large file part: {file_path}")
                                    deleted_large_count +=1
                        except Exception as e_large:
                            logger.error(f"Error processing file {file_path} in TMP_LARGE_UPLOADS_FOLDER: {e_large}")
                logger.info(f"Cleanup of TMP_LARGE_UPLOADS_FOLDER complete. Deleted {deleted_large_count} .part files.")
            else:
                logger.info(f"Directory {tmp_large_uploads_dir} does not exist or not configured. Skipping cleanup for it.")

        except Exception as e:
            logger.error(f"An unexpected error occurred in cleanup_old_temporary_files_task: {e}", exc_info=True)
        finally:
            logger.info("cleanup_old_temporary_files_task finished.")


def delete_old_messages_task():
    with scheduler.app.app_context():
        logger.info("Running delete_old_messages_task...") # Changed print to logger.info
        try:
            db_path = current_app.config['DATABASE_PATH']
            
            if not os.path.isabs(db_path):
                db_path = os.path.join(current_app.root_path, db_path)

            logger.info(f"Connecting to database at: {db_path}") # Changed print to logger.info
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()

            retention_days = current_app.config.get('MESSAGE_RETENTION_DAYS', 180)
            logger.info(f"Using message retention period of {retention_days} days.") # Changed print to logger.info
            cutoff_date = datetime.now() - timedelta(days=int(retention_days))
            cutoff_timestamp = cutoff_date.strftime('%Y-%m-%d %H:%M:%S')

            logger.info(f"Deleting messages older than: {cutoff_timestamp}") # Changed print to logger.info
            
            cursor.execute("DELETE FROM messages WHERE created_at < ?", (cutoff_timestamp,))
            conn.commit()
            
            deleted_count = cursor.rowcount
            logger.info(f"Successfully deleted {deleted_count} old messages.") # Changed print to logger.info

        except sqlite3.Error as e:
            logger.error(f"Database error in delete_old_messages_task: {e}") # Changed print to logger.error
        except Exception as e:
            logger.error(f"An unexpected error occurred in delete_old_messages_task: {e}", exc_info=True) # Changed print to logger.error
        finally:
            if 'conn' in locals() and conn:
                conn.close()
            logger.info("delete_old_messages_task finished.") # Changed print to logger.info
