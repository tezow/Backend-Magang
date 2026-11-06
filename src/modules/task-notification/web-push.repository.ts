import { pool } from "../../db/pool";

export const saveSubscription = async (email: string, sub: any) => {
    await pool.query(
        `INSERT INTO web_push_subscriptions (email_sat, endpoint, p256dh, auth) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (endpoint) DO UPDATE SET email_sat = $1, p256dh = $3, auth = $4`,
        [email, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
    );
};

export const deleteSubscription = async (endpoint: string) => {
    await pool.query('DELETE FROM web_push_subscriptions WHERE endpoint = $1', [endpoint]);
};

export const getSubscriptionsByEmail = async (email: string) => {
    const res = await pool.query('SELECT * FROM web_push_subscriptions WHERE email_sat = $1', [email]);
    return res.rows;
};

export const getAllSubscribedEmails = async () => {
    const res = await pool.query('SELECT DISTINCT email_sat FROM web_push_subscriptions');
    return res.rows.map(r => r.email_sat);
};
