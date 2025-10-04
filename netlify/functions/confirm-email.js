// netlify/functions/confirm-email.js
import crypto from 'crypto';
import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  try {
    const token = event.queryStringParameters?.token || '';
    if (!token) return html(400, 'Missing token');

    const secret = process.env.CODE_SIGNING_SECRET;
    if (!secret) return html(500, 'Server not configured');

    const parsed = verifyToken(token, secret);
    if (!parsed.ok) return html(400, 'Invalid token');

    const { email, exp, purpose } = parsed.payload || {};
    if (purpose !== 'confirm') return html(400, 'Wrong token purpose');
    if (!email || Date.now() > exp) return html(400, 'Token expired');

    const store = getStore({ name: 'verified_emails' });
    const key = email.toLowerCase();
    const prev = JSON.parse((await store.get(key)) || '{}');

    const record = {
      email: key,
      confirmed: true,
      confirmed_at: new Date().toISOString(),
      verified: !!prev.verified,
      verified_at: prev.verified_at || null
    };
    await store.set(key, JSON.stringify(record));

    return html(200, 'Email confirmed! You can return to the site and finish verification.');
  } catch {
    return html(500, 'Unexpected error');
  }
};

// helpers
function b64urlDecode(str){ str=str.replace(/-/g,'+').replace(/_/g,'/'); while (str.length%4) str+='='; return Buffer.from(str,'base64').toString('utf8'); }
function verifyToken(token, secret){
  try{
    const [h,p,s]=token.split('.');
    if(!h||!p||!s) return {ok:false,error:'Malformed'};
    const data=`${h}.${p}`;
    const expected=crypto.createHmac('sha256', secret).update(data).digest();
    const expectedB64=expected.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const a=Buffer.from(expectedB64), b=Buffer.from(s);
    if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return {ok:false,error:'Bad sig'};
    const payload=JSON.parse(b64urlDecode(p));
    return {ok:true,payload};
  }catch{ return {ok:false,error:'Invalid'}; }
}
function html(status, body){
  return { statusCode: status, headers:{'Content-Type':'text/html; charset=utf-8'}, body: `<!doctype html><html><body><p>${body}</p></body></html>` };
}
