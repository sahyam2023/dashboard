from flask_apscheduler import APScheduler
import sqlite3
import os
from datetime import datetime, timedelta
from flask import current_app # To access app.config for DB path and retention period
import logging # For logging within scheduler tasks
import sys # Added for console handler
import eventlet # Added for eventlet.sleep

# Initialize scheduler
scheduler = APScheduler()
logger = logging.getLogger(__name__) # Standard Python logger for scheduler

# Configure 'scheduler' logger for direct console output
if not logger.handlers: # Add handler only if no handlers are already configured for this logger
    scheduler_console_handler = logging.StreamHandler(sys.stdout)
    scheduler_console_handler.setFormatter(logging.Formatter('%(asctime)s - SCHEDULER - %(levelname)s - %(message)s'))
    logger.addHandler(scheduler_console_handler)
    logger.setLevel(logging.WARNING) # Or logging.DEBUG for more verbosity
    logger.propagate = False # Optional: Prevents messages from being passed to the root logger if Flask's logger is also printing them
    logger.info("Scheduler logger configured for console output. Level set to WARNING for production.")

def init_scheduler(app):
    """Initialize and start the scheduler."""
    # print("SCHEDULER_PY: init_scheduler function called") # Removed
    scheduler.init_app(app)
    scheduler.start()
    # print("Scheduler initialized and started.") # Removed

    # Ensure delete_old_messages_task is defined or imported before this line
    if not scheduler.get_job('Delete Old Messages'):
        # scheduler.add_job(id='Delete Old Messages', func=delete_old_messages_task, trigger='interval', minutes=1)
        # logger.info("Scheduled 'Delete Old Messages' job to run every minute.")
        logger.info("'Delete Old Messages' job is currently disabled by commenting out its scheduling line.")
    else:
        logger.info("'Delete Old Messages' job was previously scheduled but might be disabled if the add_job line is commented out.")

    if not scheduler.get_job('Cleanup Old Temporary Files'):
        # Schedule to run daily at 3 AM
        # scheduler.add_job(id='Cleanup Old Temporary Files', func=cleanup_old_temporary_files_task, trigger='interval', minutes=1)
        # logger.info("Scheduled 'Cleanup Old Temporary Files' job to run every minute.")
        logger.info("'Cleanup Old Temporary Files' job is currently disabled by commenting out its scheduling line.") # Added a log for clarity
    else:
        logger.info("'Cleanup Old Temporary Files' job was previously scheduled but might be disabled if the add_job line is commented out.")
    
    logger.info("All frequent (1-minute interval) tasks are currently disabled for testing.")

def cleanup_old_temporary_files_task():
    # print("SCHEDULER_PY_TASK: cleanup_old_temporary_files_task function starting") # Removed
    with scheduler.app.app_context():
        logger.info("cleanup_old_temporary_files_task started.")
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
                        logger.error(f"Error processing file {file_path} in tmp_standard_uploads: {e_std}", exc_info=True)
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
                            logger.error(f"Error processing file {file_path} in TMP_LARGE_UPLOADS_FOLDER: {e_large}", exc_info=True)
                logger.info(f"Cleanup of TMP_LARGE_UPLOADS_FOLDER complete. Deleted {deleted_large_count} .part files.")
            else:
                logger.info(f"Directory {tmp_large_uploads_dir} does not exist or not configured. Skipping cleanup for it.")

        except Exception as e:
            logger.error(f"An unexpected error occurred in cleanup_old_temporary_files_task: {e}", exc_info=True)
        finally:
            logger.info("cleanup_old_temporary_files_task finished.")


def delete_old_messages_task():
    # print("SCHEDULER_PY_TASK: delete_old_messages_task function starting") # Removed
    with scheduler.app.app_context():
        logger.info("delete_old_messages_task started.")
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

            # Count messages eligible for deletion first
            # print("SCHEDULER_PY_TASK_DETAIL: Attempting to count messages.") # Removed
            cursor.execute("SELECT COUNT(*) FROM messages WHERE created_at < ?", (cutoff_timestamp,))
            count_to_delete = cursor.fetchone()[0]
            # print(f"SCHEDULER_PY_TASK_DETAIL: Counted {count_to_delete} messages eligible for deletion.") # Removed
            logger.info(f"Found {count_to_delete} messages eligible for deletion (older than {cutoff_timestamp}).")

            if count_to_delete > 0:
                batch_size = 500  # Configurable batch size
                total_deleted_this_run = 0
                batches_processed = 0
                logger.info(f"Starting batched deletion with batch_size={batch_size}.")
                while True:
                    # print(f"SCHEDULER_PY_TASK_DETAIL: Attempting to delete batch. Batch number: {batches_processed + 1}. Eligible remaining (approx): {count_to_delete - total_deleted_this_run}") # Removed
                    # Using rowid for efficient deletion in batches
                    # This assumes created_at is indexed for the initial filtering,
                    # and rowid is used for the actual batch selection.
                    cursor.execute("DELETE FROM messages WHERE rowid IN (SELECT rowid FROM messages WHERE created_at < ? ORDER BY rowid LIMIT ?)", (cutoff_timestamp, batch_size))
                    batch_deleted_count = cursor.rowcount
                    # print(f"SCHEDULER_PY_TASK_DETAIL: Batch delete executed. Rows affected: {batch_deleted_count}") # Removed
                    
                    # print("SCHEDULER_PY_TASK_DETAIL: Attempting to commit batch.") # Removed
                    conn.commit() # Commit after each batch
                    # print("SCHEDULER_PY_TASK_DETAIL: Batch committed.") # Removed
                    batches_processed += 1

                    total_deleted_this_run += batch_deleted_count
                    logger.info(f"Deleted {batch_deleted_count} messages in this batch.")

                    if batch_deleted_count < batch_size:
                        # This means either all remaining eligible messages were deleted in this batch,
                        # or no messages were deleted in this batch (if count somehow became 0 due to concurrent activity, though unlikely with this task structure)
                        logger.info("Last batch processed or no more messages matched the criteria for this batch.")
                        break
                    
                    # print("SCHEDULER_PY_TASK_DETAIL: Calling eventlet.sleep(0.1)") # Removed
                    # Yield control to eventlet to prevent blocking the event loop for too long
                    eventlet.sleep(0.1) # Sleep for 100ms between batches
                
                logger.info(f"Total of {total_deleted_this_run} messages deleted in this run.")
                # print(f"SCHEDULER_PY_TASK_DETAIL: Total messages deleted in this run: {total_deleted_this_run}") # Removed
            else:
                logger.info("No messages found older than the cutoff. Nothing to delete.")

        except sqlite3.Error as e:
            logger.error(f"Database error in delete_old_messages_task: {e}", exc_info=True) # Added exc_info
        except Exception as e:
            logger.error(f"An unexpected error occurred in delete_old_messages_task: {e}", exc_info=True) # Changed print to logger.error
        finally:
            if 'conn' in locals() and conn:
                conn.close()
            if 'conn' in locals() and conn:
                conn.close()
            logger.info("delete_old_messages_task finished.") # Changed print to logger.info

DELETE_INTERVAL_SECONDS = 24 * 60 * 60 # Changed to 24 hours

def run_delete_old_messages_periodically():
    # Ensure this function can access the Flask app context if needed by the task
    # The task itself already uses 'with scheduler.app.app_context():'
    # which should work if 'scheduler.app' is set during init_scheduler.
    
    # Call the actual task logic
    logger.info(f"Eventlet scheduling: Starting delete_old_messages_task. Next run in approx 24 hours.")
    delete_old_messages_task() # This function contains all the print and logging statements
    
    # Reschedule a new green thread
    eventlet.spawn_after(DELETE_INTERVAL_SECONDS, run_delete_old_messages_periodically)
    logger.info(f"Eventlet scheduling: delete_old_messages_task finished. Rescheduled for 24 hours.")

CLEANUP_INTERVAL_SECONDS = 24 * 60 * 60 # Changed to 24 hours

def run_cleanup_files_periodically():
    # The cleanup_old_temporary_files_task already uses 'with scheduler.app.app_context():'
    logger.info(f"Eventlet scheduling: Starting cleanup_old_temporary_files_task. Next run in approx 24 hours.")
    cleanup_old_temporary_files_task() # This function contains its own print and logging
    
    # Reschedule
    eventlet.spawn_after(CLEANUP_INTERVAL_SECONDS, run_cleanup_files_periodically)
    logger.info(f"Eventlet scheduling: cleanup_old_temporary_files_task finished. Rescheduled for 24 hours.")
