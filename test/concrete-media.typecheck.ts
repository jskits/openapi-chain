import { createClient, type OperationInputFor } from '../packages/core/src/index.js';

type Paths = {
  '/all': {
    post: { requestBody: { content: { '*/*': unknown } }; responses: { 204: { content: never } } };
  };
  '/text': {
    post: {
      requestBody: { content: { 'text/*': string } };
      responses: { 204: { content: never } };
    };
  };
};
const api = createClient<Paths>({ baseUrl: 'https://api.test' });
void api.all.post({ body: {}, contentType: 'application/json' });
void api.text.post({ body: 'ok', contentType: 'text/plain' });
void api.all.post({ body: {}, contentType: 'application/json; profile="*"' });
// @ts-expect-error media range cannot be sent as a concrete Content-Type
void api.all.post({ body: {}, contentType: '*/*' });
// @ts-expect-error subtype wildcard is not concrete
void api.text.post({ body: 'x', contentType: 'text/*' });
// @ts-expect-error embedded wildcard is not concrete
void api.all.post({ body: {}, contentType: 'application/foo*' });
const input = { body: {}, contentType: '*/*' } as const satisfies OperationInputFor<
  Paths,
  '/all',
  'post'
>;
// @ts-expect-error named literal input is also checked at the operation boundary
void api.all.post(input);
