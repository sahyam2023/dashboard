# Proposed Dashboard Improvements

This document outlines suggested features, fixes, and UI/UX enhancements to make the dashboard more professional, user-friendly, and robust.

## I. General UI/UX Enhancements

1.  **Consistent Styling:**
    *   Further solidify your design language using Tailwind CSS for all components (tables, forms, buttons, modals).
    *   Define and reuse common styling classes.


4.  **Enhanced Feedback (Toast Notifications):**
    *   Replace or augment the current `feedbackMessage` system with toast notifications (e.g., using `react-toastify` or `sonner`) for non-intrusive and modern feedback on actions.



## II. Feature Suggestions for User-Facing Dashboard (e.g., `DocumentsView`, `PatchesView`)

1.  **Bulk Actions (for Admins):**
    *   Implement checkbox-based selection in tables for bulk operations like "Delete Selected," "Change Category/Software for Selected."





## IV. Fixes/Improvements Based on Code Review

1.  **Error Handling in Data Fetching:**
    *   When API calls fail during data refresh (pagination, sorting), keep stale data visible and show a non-intrusive error toast instead of clearing the view.
2.  **Feedback Message Handling:**
    *   Transition from `feedbackMessage` state to toast notifications for a more standard and less obtrusive user experience.
3.  **Admin Form Enhancements (e.g., `AdminDocumentEntryForm`):**
    *   Review and improve forms for clearer validation feedback, appropriate input types, loading/disabled states on submission, and better file upload UX.

## V. Notifications System

This section details the newly implemented real-time notification system.

### User Guide

The notification system is designed to keep users informed about relevant activities within the dashboard.

**Overview:**

*   Users receive real-time notifications for various events.
*   A notification bell icon in the header indicates new/unread notifications.
*   Clicking the bell opens a panel displaying a list of recent notifications.

**Types of Notifications:**

*   **General User Notifications:**
    *   **New Document Added:** When a new document is uploaded to the system.
    *   **File Permission Changed For You:** When an administrator changes your viewing or downloading permissions for a specific file.
    *   **Comment Added:** When someone comments on an item you own or have also commented on.
    *   **You Are Mentioned:** When another user @mentions you in a comment.
    *   **Your File Upload Completes:** Confirmation that a file you uploaded has finished processing.
    *   *(Potentially)* **Your File Download Completes:** Confirmation that a file you initiated for download has completed (this might be less common for web UI downloads).
*   **Admin-Only Notifications (visible to 'admin' and 'super_admin' roles):**
    *   **Document Deleted:** When any document is deleted from the system.
    *   **Document Updated:** When any document's metadata or file is updated.
    *   **Bulk Action: Documents Deleted:** When a bulk deletion of documents is performed.

**Managing Preferences:**

*   Users can customize which types of notifications they wish to receive.
*   Navigate to your **User Profile** page (accessible from the header).
*   A "Notification Settings" section allows you to toggle subscriptions for each available notification type.
*   A master toggle is provided to quickly enable or disable all notifications.
*   Changes are saved by clicking the "Save Settings" button.

**Interacting with the Notification Panel:**

*   **Opening/Closing:** Click the bell icon in the header to open and close the panel.
*   **Viewing Notifications:** The panel lists your recent notifications, with the newest at the top. Unread notifications are typically highlighted.
*   **Mark All As Read:** A button within the panel allows you to mark all currently unread notifications as read. This will clear the unread count badge on the bell icon.
*   **Delete Individual Notification:** Each notification can be deleted from the panel (usually via an 'x' or delete icon on the notification item).
*   **Clear All Notifications:** A button allows you to delete all your notifications from the panel. This action is typically permanent.
*   **Infinite Scroll/Pagination:** The panel will initially load a set number of notifications. Scrolling to the bottom may load more, or a "Load More" button might be present.

### API Endpoints

The following API endpoints support the notification system. All endpoints require JWT authentication.

1.  **Get User Notification Preferences**
    *   **Endpoint:** `GET /api/user/notification-preferences`
    *   **Auth:** Required (User's own preferences)
    *   **Response:** `200 OK`
        ```json
        [
          { "notification_type": "document_added", "is_subscribed": true },
          { "notification_type": "comment_added", "is_subscribed": false },
          // ... other preference types
        ]
        ```
    *   **Notes:** Returns all available notification types with the user's current subscription status. Defaults to `true` (subscribed) if a preference hasn't been explicitly set by the user for a type.

2.  **Update User Notification Preferences**
    *   **Endpoint:** `PUT /api/user/notification-preferences`
    *   **Auth:** Required (User's own preferences)
    *   **Request Body:**
        ```json
        [
          { "notification_type": "document_added", "is_subscribed": false },
          { "notification_type": "comment_added", "is_subscribed": true }
          // ... other preferences to update
        ]
        ```
    *   **Response:** `200 OK`
        ```json
        {
          "msg": "Notification preferences updated successfully.",
          "preferences": [
            { "notification_type": "document_added", "is_subscribed": false },
            { "notification_type": "comment_added", "is_subscribed": true }
            // ... updated preferences
          ]
        }
        ```
    *   **Notes:** Updates preferences in bulk. Uses UPSERT logic.

3.  **Get Notifications**
    *   **Endpoint:** `GET /api/notifications`
    *   **Auth:** Required (User's own notifications)
    *   **Query Parameters:**
        *   `page` (optional, default: 1)
        *   `per_page` (optional, default: 20)
    *   **Response:** `200 OK`
        ```json
        {
          "notifications": [
            {
              "id": 1,
              "user_id": 123,
              "actor_id": 456,
              "actor_username": "some_user",
              "event_type": "document_added",
              "target_type": "document",
              "target_id": 789,
              "target_name": "My New Document",
              "message": "some_user added a new document: My New Document",
              "is_read": false,
              "created_at": "2023-10-26T10:00:00Z"
            }
            // ... more notifications
          ],
          "unread_count": 5,
          "page": 1,
          "per_page": 20,
          "total_notifications": 50,
          "total_pages": 3
        }
        ```

4.  **Mark All Notifications as Read**
    *   **Endpoint:** `POST /api/notifications/mark-all-as-read`
    *   **Auth:** Required
    *   **Response:** `200 OK`
        ```json
        { "msg": "Successfully marked X notification(s) as read." }
        ```

5.  **Delete a Specific Notification**
    *   **Endpoint:** `DELETE /api/notifications/<notification_id>`
    *   **Auth:** Required
    *   **Response:**
        *   `200 OK`: `{"msg": "Notification deleted successfully."}`
        *   `404 Not Found`: If notification doesn't exist or doesn't belong to the user.

6.  **Delete All Notifications for Current User**
    *   **Endpoint:** `DELETE /api/notifications/all`
    *   **Auth:** Required
    *   **Response:** `200 OK`
        ```json
        { "msg": "Successfully deleted X notification(s)." }
        ```
