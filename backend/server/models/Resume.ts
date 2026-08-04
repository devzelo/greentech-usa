import mongoose, { Schema, Document } from "mongoose";

// One resume per user account. Employees edit their own; visibility is
// owner + admin + project owners who have this employee assigned (for proposals).
export interface IResume extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  summary: string;
  citizenship: string; // nationality / residency — required by certain client resume formats (e.g. Dept. of State)
  assignmentOnProject: string; // GT template: assignment on this project
  yearsOfExperience: string;   // GT template: years of experience
  remark: string;              // GT template: remark (SME areas, clearances, etc.)
  showPhoto: boolean;          // include the photo on the PDF (default true)
  contact: { email: string; phone: string; location: string };
  photoUrl: string; // optional override; falls back to the user's avatar
  experience: Array<{ company: string; role: string; start: string; end: string; description: string }>;
  projects: Array<{ name: string; role: string; start: string; end: string; description: string; projectId?: string; employer?: string; client?: string; solicitationNo?: string; contractNo?: string; cost?: string }>;
  education: Array<{ school: string; degree: string; field: string; start: string; end: string }>;
  skills: string[];
  certifications: Array<{ name: string; issuer: string; year: string }>;
  languages: Array<{ name: string; level: string }>;
  customSections: Array<{ heading: string; body: string }>;
}

const ResumeSchema = new Schema<IResume>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    title: { type: String, default: "" },
    summary: { type: String, default: "" },
    citizenship: { type: String, default: "" },
    assignmentOnProject: { type: String, default: "" },
    yearsOfExperience: { type: String, default: "" },
    remark: { type: String, default: "" },
    showPhoto: { type: Boolean, default: true },
    contact: {
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      location: { type: String, default: "" },
    },
    photoUrl: { type: String, default: "" },
    experience: [
      {
        company: { type: String, default: "" },
        role: { type: String, default: "" },
        start: { type: String, default: "" },
        end: { type: String, default: "" },
        description: { type: String, default: "" },
      },
    ],
    projects: [
      {
        name: { type: String, default: "" },
        role: { type: String, default: "" },
        start: { type: String, default: "" },
        end: { type: String, default: "" },
        description: { type: String, default: "" },
        projectId: { type: String, default: "" },
        employer: { type: String, default: "" },
        client: { type: String, default: "" },
        solicitationNo: { type: String, default: "" },
        contractNo: { type: String, default: "" },
        cost: { type: String, default: "" },
      },
    ],
    education: [
      {
        school: { type: String, default: "" },
        degree: { type: String, default: "" },
        field: { type: String, default: "" },
        start: { type: String, default: "" },
        end: { type: String, default: "" },
      },
    ],
    skills: [{ type: String }],
    certifications: [
      {
        name: { type: String, default: "" },
        issuer: { type: String, default: "" },
        year: { type: String, default: "" },
      },
    ],
    languages: [
      {
        name: { type: String, default: "" },
        level: { type: String, default: "" },
      },
    ],
    customSections: [
      {
        heading: { type: String, default: "" },
        body: { type: String, default: "" },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<IResume>("Resume", ResumeSchema);
