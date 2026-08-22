import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name:             { type: String, required: true },
  email:            { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:         { type: String, required: true },
  role:             { type: String, enum: ['admin', 'employee', 'subcontractor'], default: 'employee' },
  empId:            { type: String, default: '' },
  phone:            { type: String, default: '' },
  personalEmail:    { type: String, default: '' }, // CR-P-57 — personal email (login uses `email` = business email)
  archived:         { type: Boolean, default: false }, // CR-P-58 — deactivated: blocked from logging in
  avatarUrl:        { type: String, default: '' },
  signatureUrl:     { type: String, default: '' }, // personal signature image, used on PO documents
  jobTitle:         { type: String, default: '' },
  backupEnabled:    { type: Boolean, default: true },
  backupDay:        { type: Number, default: 1, min: 1, max: 28 },
  lastBackupSent:   { type: Date },
  resetToken:       { type: String },
  resetTokenExpiry: { type: Date },
}, { timestamps: true });

export default mongoose.model('User', UserSchema);
