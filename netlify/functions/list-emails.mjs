import { getStore } from "@netlify/blobs";

const siteID = process.env.NETLIFY_SITE_ID;
const token  = process.env.NETLIFY_BLOBS_TOKEN;

// Which stores to scan for email keys
 const DEFAULT_STORES = [
   "email_status", 
   "user_credentials",
   "verified_emails",
   "email_codes",
   "email_index",
 ];

 // Ensure we get data from email_status for verification/confirmation
//const DEFAULT_STORES = ["email_status"];

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method Not Allowed" });
  }


  try {
    const qp = event.queryStringParameters || {};
    const stores =
      (qp.stores ? qp.stores.split(",") : DEFAULT_STORES).map((s) => s.trim()).filter(Boolean);

    const seen = new Set();
    const emailData = [];

    for (const name of stores) {
      try {
        console.log(`Processing store: ${name}`); // Debugging line to show which store is being processed
        const store = getStore({ name, siteID, token });
        const listing = await store.list(); // Netlify Blobs list
        const blobs = Array.isArray(listing) ? listing : (listing?.blobs || []);

        for (const b of blobs) {
          const key = (b?.key ?? b)?.toString();
          if (!key || !key.includes("@")) continue;

          //console.log(`${b} found email key: ${key}`); // Debugging line to check if we're finding the emails
          //alert(`${b} found email key: ${key}`); // Debugging line to check if we're finding the emails
          seen.add(key);

          // Fetch email status and related fields from the email_status store
          const emailStatus = await store.get(key);
         console.log('emailStatus:', emailStatus);
          const statusData = emailStatus ? JSON.parse(emailStatus) : {};

          console.log(`Email status for ${key}:`, statusData); // Debugging line to check email status
         //EMAIL_STATUS:      {"confirmed":true,"confirmedAt":1759948595696,"email":"davidfalbright@yahoo.com","verified":true,"verifiedAt":1759948613396}
         
          // Now create an object with the correct fields
          emailData.push({
            email: key,
            emailSent: statusData.emailSent || false,  // Check if the email was sent
            emailSentDate: statusData.emailSentDate || null, // Timestamp for email sent
           
            codeVerified: statusData.codeVerified || false, // Check if the code was verified
            codeVerifiedDate: statusData.codeVerifiedDate || null, // Timestamp for code verification
           
            confirmed: statusData.confirmed || false, // Check if the email was confirmed
            confirmedAt: statusData.confirmedAt || null, // Timestamp for confirmation
           
            verified: statusData.verified || false,  // Check if the email was verified
            verifiedAt: statusData.verifiedAt || null, // Timestamp for verification
          });
        }
      } catch (error) {
        console.error(`Error while processing store ${name}:`, error);
      }
    }

    const emails = Array.from(seen).sort();
    console.log("Emails found:", emails); // Debugging line to check if we're finding emails

    return json(200, { ok: true, emails, emailData });
  } catch (e) {
    console.error("list-emails error:", e);
    return json(500, { error: "Unexpected server error" });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}
