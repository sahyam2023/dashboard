import { http, HttpResponse } from 'msw';

const API_BASE_URL = 'http://127.0.0.1:7000';

export const handlers = [
  // Example: Mock for fetching comments
  http.get(`${API_BASE_URL}/api/items/:itemType/:itemId/comments`, ({ params, request }) => {
    const url = new URL(request.url);
    const page = url.searchParams.get('page') || '1';
    const perPage = url.searchParams.get('per_page') || '20';

    // You can customize this mock based on params.itemType, params.itemId, page, perPage
    if (params.itemId === '1' && params.itemType === 'document') {
      return HttpResponse.json({
        comments: [
          { id: 1, content: 'This is a test comment for document 1', user_id: 1, username: 'testuser', item_id: 1, item_type: 'document', parent_comment_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), replies: [] },
          { id: 2, content: 'Another test comment for document 1', user_id: 2, username: 'anotheruser', item_id: 1, item_type: 'document', parent_comment_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), replies: [] },
        ],
        total_top_level_comments: 2,
        page: parseInt(page),
        per_page: parseInt(perPage),
        total_pages: 1,
      });
    }
    // Default empty response for other items or if specific mock not needed
    return HttpResponse.json({
      comments: [],
      total_top_level_comments: 0,
      page: 1,
      per_page: 20,
      total_pages: 0,
    });
  }),

  // Mock for adding a comment
  http.post(`${API_BASE_URL}/api/items/:itemType/:itemId/comments`, async ({ request, params }) => {
    const newCommentPayload = await request.json() as any;
    const newComment = {
      id: Math.floor(Math.random() * 1000) + 3, // Random ID
      ...newCommentPayload,
      user_id: 1, // Assume current user is 1 for mock
      username: 'testuser', // Assume current user for mock
      item_id: parseInt(params.itemId as string),
      item_type: params.itemType as string,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      replies: [],
    };
    return HttpResponse.json(newComment, { status: 201 });
  }),

  // Mock for updating a comment
  http.put(`${API_BASE_URL}/api/comments/:commentId`, async ({ request, params }) => {
    const updatedContentPayload = await request.json() as any;
    // In a real scenario, you might want to fetch the original comment or have a mock DB
    const updatedComment = {
      id: parseInt(params.commentId as string),
      content: updatedContentPayload.content,
      user_id: 1, // Assume current user is 1
      username: 'testuser',
      item_id: 1, // Mock item_id
      item_type: 'document', // Mock item_type
      parent_comment_id: null,
      created_at: new Date().toISOString(), // Should be original creation date
      updated_at: new Date().toISOString(),
      replies: [],
    };
    return HttpResponse.json(updatedComment, { status: 200 });
  }),

  // Mock for deleting a comment
  http.delete(`${API_BASE_URL}/api/comments/:commentId`, () => {
    return HttpResponse.json({ msg: 'Comment deleted successfully' }, { status: 200 });
    // Or return new HttpResponse(null, { status: 204 }) if your API does that
  }),

  // Mock for user mention suggestions
  http.get(`${API_BASE_URL}/api/users/mention_suggestions`, ({request}) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    interface UserMentionSuggestion {
      id: number;
      username: string;
    }
    let suggestions: UserMentionSuggestion[] = [];
    if (query === 'test') {
      suggestions = [
        { id: 1, username: 'testuser' },
        { id: 2, username: 'tester' },
      ];
    } else if (query === 'mention') {
        suggestions = [
            { id: 3, username: 'mentionUser123' }
        ]
    }
    return HttpResponse.json(suggestions);
  }),

  // Fallback for any other unhandled API requests if needed,
  // though onUnhandledRequest: 'warn' in setupTests.ts is often better.
  // http.get(`${API_BASE_URL}/*`, () => {
  //   console.warn("Unhandled GET request in MSW");
  //   return new HttpResponse(null, { status: 404 });
  // }),
];
