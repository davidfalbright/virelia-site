// Returns a signed, short-lived, "guest" session token.
import crypto from 'crypto';

export const handler = async () => {
  try{
    const SECRET = process.env.SESSION_SIGNING_SECRET || process.env.CODE_SIGNING_SECRET;
    if(!SECRET) return json(500, { error: 'Server not configured' });

    const now = Date.now();
    const payload = {
      sub: 'guest',
      guest: true,
      iat: now,
      exp: now + 30*60*1000  // 30 minutes
    };
    const token = signToken(payload, SECRET);
    return json(200, { ok:true, sessionToken: token });
  }catch(e){
    return json(500, { error: 'Unexpected server error' });
  }
};

function json(code,obj){ return { statusCode:code, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}, body: JSON.stringify(obj) }; }
function b64url(b){ return Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function signToken(payload, secret){
  const h=b64url(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const p=b64url(JSON.stringify(payload));
  const data=`${h}.${p}`;
  const sig=crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}
