/**
 * Print a new JWT_SECRET for backend/.env (invalidates all existing login sessions).
 * Usage: cd backend && npm run security:new-jwt-secret
 */
import crypto from 'node:crypto';

const secret = crypto.randomBytes(48).toString('base64');
console.log('Add or replace in backend/.env:\n');
console.log(`JWT_SECRET=${secret}`);
console.log('\nThen restart the backend. All staff must log in again.');
