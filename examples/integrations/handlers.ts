import { http, HttpResponse } from 'msw';

// Share these handlers between setupServer (Node) and setupWorker (browser).
export const handlers = [
  http.get('https://catalog.test/items/:id', ({ params, request }) => {
    if (params.id === 'missing')
      return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    return HttpResponse.json({
      id: params.id,
      label: `${new URL(request.url).searchParams.get('locale')}:${request.headers.get('authorization')}`,
    });
  }),
  http.patch('https://catalog.test/items/:id', async ({ params, request }) => {
    const body = (await request.json()) as { label: string };
    return HttpResponse.json({ id: params.id, label: body.label });
  }),
];
