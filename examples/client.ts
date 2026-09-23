import { createClient } from '../packages/core/src/index.js';
import type { paths } from './schema.js';

const api = createClient<paths>({
  baseUrl: 'https://petstore3.swagger.io/api/v3',
});

const pet = await api.pet(1).get();
console.log(pet);
