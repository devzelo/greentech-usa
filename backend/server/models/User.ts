import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name:             { type: String, required: true },
  email:            { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:         { type: String, required: true },
  role:             { type: String, enum: ['admin', 'employee', 'subcontractor'], default: 'employee' },
  empId:            { type: String, default: '' },
  phone:            { type: String, default: '' },
  personalEmail:    { type: String, default: '' }, // CR-P-57 — personal email (login uses `email` = business email)
  homeAddress:      { type: String, default: '' }, // CR-P (12) — personal home address
  archived:         { type: Boolean, default: false }, // CR-P-58 — deactivated: blocked from logging in
  avatarUrl:        { type: String, default: '' },
  signatureUrl:     { type: String, default: '' }, // personal signature image, used on PO documents
  // CR-P (16) — named signatures with a default: a company login can hold one per signer person.
  // The default's url is mirrored into `signatureUrl` so every existing consumer keeps working.
  // CR 364 - each signature is a full signature block: who signs (name, title) and how to reach them
  // (phone, email, website, address), filled from the profile when it is made and editable.
  signatures:       [{
    label: { type: String, default: '' }, url: { type: String, required: true }, isDefault: { type: Boolean, default: false },
    name: { type: String, default: '' }, title: { type: String, default: '' }, phone: { type: String, default: '' },
    email: { type: String, default: '' }, website: { type: String, default: '' }, address: { type: String, default: '' },
  }],
  // CR-P (16) — hard link from a guest login to its Directory company (email matching is fragile).
  companyId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  // CR-P (16) — uploaded resume file (separate from the resume builder).
  resumeFile:       { name: { type: String, default: '' }, filePath: { type: String, default: '' }, size: { type: String, default: '' } },
  jobTitle:         { type: String, default: '' },
  // 2026-10-08 - the profile's picture gallery (ID cards, profile reports, company profiles).
  gallery:          [{ url: { type: String, required: true }, title: { type: String, default: '' }, description: { type: String, default: '' }, uploadedAt: { type: Date, default: Date.now } }],
  backupEnabled:    { type: Boolean, default: true },
  backupDay:        { type: Number, default: 1, min: 1, max: 28 },
  lastBackupSent:   { type: Date },
  resetToken:       { type: String },
  resetTokenExpiry: { type: Date },
}, { timestamps: true });

export default mongoose.model('User', UserSchema);
