import sqlite3
from datetime import datetime, timedelta # Added timedelta for offset check
import pytz
import os

# Define timezones
IST = pytz.timezone('Asia/Kolkata')
UTC = pytz.utc

# Database path (assuming script is run from project root)
DB_PATH = os.path.join('instance', 'software_dashboard.db')

# Tables and columns to migrate
# Format: ('table_name', ['column1', 'column2', ...])
TABLES_AND_COLUMNS = [
    ('comments', ['created_at', 'updated_at']),
    ('users', ['created_at']),
    ('versions', ['created_at', 'updated_at']),  # release_date is DATE
    ('documents', ['created_at', 'updated_at']),
    ('patches', ['created_at', 'updated_at']),    # release_date is DATE
    ('links', ['created_at', 'updated_at']),
    ('misc_categories', ['created_at', 'updated_at']),
    ('misc_files', ['created_at', 'updated_at']),
    ('user_favorites', ['created_at']),
    ('download_log', ['download_timestamp']),
    ('audit_logs', ['timestamp']),
    ('password_reset_requests', ['expires_at']),
    ('file_permissions', ['created_at', 'updated_at']),
    ('system_settings', ['updated_at']),
    ('notifications', ['created_at', 'updated_at']),
]

def parse_and_convert_timestamp(ts_str, table, column, row_id):
    """
    Parses a timestamp string (assumed to be UTC) and converts it to IST.
    Returns the new timestamp string in 'YYYY-MM-DD HH:MM:SS' format.
    """
    if not ts_str:
        return None

    parsed_dt = None
    original_ts_str_for_log = ts_str # Keep original for logging

    try:
        # Attempt 1: ISO format with 'Z' (e.g., "YYYY-MM-DDTHH:MM:SSZ" or with microseconds)
        if 'T' in ts_str and ts_str.endswith('Z'):
            # Remove 'Z' and parse as naive, then make UTC aware
            ts_str_no_z = ts_str[:-1]
            if '.' in ts_str_no_z:
                parsed_dt = datetime.strptime(ts_str_no_z, '%Y-%m-%dT%H:%M:%S.%f')
            else:
                parsed_dt = datetime.strptime(ts_str_no_z, '%Y-%m-%dT%H:%M:%S')
            aware_utc_dt = UTC.localize(parsed_dt)
        # Attempt 2: ISO format with explicit UTC offset (e.g., "+00:00")
        elif '+' in ts_str and ':' in ts_str[ts_str.rfind('+'):]: # Basic check for offset
            parsed_dt_aware = datetime.fromisoformat(ts_str)
            if parsed_dt_aware.tzinfo is not None and parsed_dt_aware.tzinfo.utcoffset(parsed_dt_aware) == timedelta(0):
                aware_utc_dt = parsed_dt_aware # Already UTC aware
            else: # Has an offset but it's not UTC, convert to UTC
                print(f"Warning ({table} r{row_id} c:{column}): Timestamp '{original_ts_str_for_log}' has non-UTC offset {parsed_dt_aware.tzinfo}. Converting to UTC first.")
                aware_utc_dt = parsed_dt_aware.astimezone(UTC)
        # Attempt 3: Plain 'YYYY-MM-DD HH:MM:SS' (likely from CURRENT_TIMESTAMP)
        else:
            if '.' in ts_str: # With microseconds
                parsed_dt = datetime.strptime(ts_str, '%Y-%m-%d %H:%M:%S.%f')
            else: # Without microseconds
                parsed_dt = datetime.strptime(ts_str, '%Y-%m-%d %H:%M:%S')
            aware_utc_dt = UTC.localize(parsed_dt) # Localize as UTC

    except ValueError as e:
        print(f"Warning ({table} r{row_id} c:{column}): Could not parse timestamp '{original_ts_str_for_log}' with known formats. Error: {e}. Skipping.")
        return None
    except Exception as e: # Catch any other unexpected parsing error
        print(f"Error ({table} r{row_id} c:{column}): Unexpected error parsing timestamp '{original_ts_str_for_log}': {e}. Skipping.")
        return None

    # Convert to IST and format
    ist_dt = aware_utc_dt.astimezone(IST)
    return ist_dt.strftime('%Y-%m-%d %H:%M:%S')


def migrate_timestamps():
    print(f"Connecting to database: {DB_PATH}")
    if not os.path.exists(DB_PATH):
        print(f"Error: Database file not found at {DB_PATH}")
        print("Please ensure the script is run from the project root or adjust DB_PATH.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    total_rows_updated_all_tables = 0

    try:
        conn.execute("BEGIN TRANSACTION;")
        print("Database transaction started.")

        for table_name, columns in TABLES_AND_COLUMNS:
            print(f"\nProcessing table: {table_name} for columns: {', '.join(columns)}")

            # Construct the SELECT query dynamically for all specified columns plus rowid
            select_cols_str = ", ".join(columns)
            query = f"SELECT rowid, {select_cols_str} FROM {table_name}"

            try:
                cursor.execute(query)
                rows = cursor.fetchall()
            except sqlite3.Error as e:
                print(f"Error fetching data from {table_name}: {e}. Skipping table.")
                continue

            rows_updated_in_table = 0
            for row_index, row_data_tuple in enumerate(rows):
                rowid = row_data_tuple[0]

                # Create a mapping of column name to its value for the current row
                # The first element of row_data_tuple is rowid, so actual column values start from index 1
                row_values = dict(zip(columns, row_data_tuple[1:]))

                updates_for_row = [] # List of (column_name, new_ts_str)

                for col_name in columns:
                    original_ts_str = row_values.get(col_name)
                    if original_ts_str is None or str(original_ts_str).strip() == "":
                        # print(f"Skipping {table_name} r{rowid} c:{col_name} (empty or NULL)")
                        continue

                    new_ts_val = parse_and_convert_timestamp(str(original_ts_str), table_name, col_name, rowid)
                    if new_ts_val:
                        updates_for_row.append((col_name, new_ts_val))

                if updates_for_row:
                    set_clauses = ", ".join([f"{col_update[0]} = ?" for col_update in updates_for_row])
                    update_params = [col_update[1] for col_update in updates_for_row]
                    update_params.append(rowid)

                    update_sql = f"UPDATE {table_name} SET {set_clauses} WHERE rowid = ?"
                    try:
                        conn.execute(update_sql, tuple(update_params))
                        rows_updated_in_table += 1
                    except sqlite3.Error as e:
                        print(f"Error updating {table_name} r{rowid}: {e}. SQL: {update_sql}, Params: {update_params}")


            if rows_updated_in_table > 0:
                print(f"Converted and updated {rows_updated_in_table} row(s) in table {table_name}.")
            elif not rows:
                 print(f"Table {table_name} is empty or no rows fetched.")
            else:
                print(f"No timestamps required conversion or updatable in table {table_name}.")
            total_rows_updated_all_tables += rows_updated_in_table

        confirmation = input(f"\nProcessed all tables. Total rows modified across all tables: {total_rows_updated_all_tables}.\nDo you want to commit these changes? (yes/no): ").strip().lower()
        if confirmation == 'yes':
            conn.commit()
            print("Migration committed successfully.")
        else:
            conn.rollback()
            print("Migration rolled back. No changes were saved to the database.")

    except sqlite3.Error as e:
        print(f"Database error occurred: {e}")
        conn.rollback()
        print("Migration rolled back due to error.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        conn.rollback()
        print("Migration rolled back due to unexpected error.")
    finally:
        if conn:
            conn.close()
            print("Database connection closed.")

if __name__ == '__main__':
    print("UTC to IST Timestamp Migration Script")
    print("------------------------------------")
    print("This script will attempt to convert existing UTC timestamps in the database")
    print(f"({DB_PATH}) to IST ('Asia/Kolkata').")
    print("It assumes timestamps ending with 'Z' or in 'YYYY-MM-DD HH:MM:SS' format are UTC.")
    print("The new format will be 'YYYY-MM-DD HH:MM:SS' representing IST.")
    print("\nIMPORTANT: Please back up your database file before proceeding.\n")

    user_confirmation = input("Are you sure you want to continue? (yes/no): ").strip().lower()

    if user_confirmation == 'yes':
        migrate_timestamps()
    else:
        print("Migration cancelled by user.")
