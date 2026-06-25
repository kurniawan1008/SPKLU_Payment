// Pembungkus respons sukses standar: { success: true, data }
const ok = (res, data = null, status = 200) => res.status(status).json({ success: true, data });

module.exports = { ok };
