import 'dotenv/config';
import { config } from './src/config/AppConfig';

console.log('--- Env Var Debug ---');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('GROQ_API_KEY (raw):', process.env.GROQ_API_KEY ? 'Set' : 'Unset');
if (process.env.GROQ_API_KEY) {
    console.log('GROQ_API_KEY length:', process.env.GROQ_API_KEY.length);
    console.log('GROQ_API_KEY prefix:', process.env.GROQ_API_KEY.substring(0, 4) + '...');
}
console.log('AppConfig.groq.apiKey:', config.groq.apiKey ? 'Set' : 'Unset');
console.log('---------------------');
