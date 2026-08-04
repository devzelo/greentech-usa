import mongoose, { Schema, Document } from "mongoose";

// A resume for a subcontractor's person, built BY the employer in the GreenTech format
// (the subcontractor's own resume is reformatted here). Unlike the employee Resume,
// these are NOT tied to a login account, a subcontractor can have many, and they live
// in a company-wide library so the same person can be reused across projects.
export interface ISubResume extends Document {
  ownerId: mongoose.Types.ObjectId; // who created it (for audit; visibility is company-wide to staff)
  personName: string;               // the subcontractor's employee this resume is for
  subcontractorName: string;        // which subcontractor company (matches Project.subcontractors[].name)
  title: string;
  summary: string;
  citizenship: string;
  assignmentOnProject: string;
  yearsOfExperience: string;
  remark: string;
  showPhoto: boolean;
  contact: { email: string; phone: string; location: string };
  photoUrl: string;
  experience: Array<{ company: string; role: string; start: string; end: string; description: string }>;
  projects: Array<{ name: string; role: string; start: string; end: string; description: string; projectId?: string; employer?: string; client?: string; solicitationNo?: string; contractNo?: string; cost?: string }>;
  education: Array<{ school: string; degree: string; field: string; start: string; end: string }>;
  skills: string[];
  certifications: Array<{ name: string; issuer: string; year: string }>;
  languages: Array<{ name: string; level: string }>;
  customSections: Array<{ heading: string; body: string }>;
}

const SubResumeSchema = new Schema<ISubResume>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    personName: { type: String, default: "" },
    subcontractorName: { type: String, default: "", index: true },
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
    experience: [{ company: String, role: String, start: String, end: String, description: String }],
    projects: [{ name: String, role: String, start: String, end: String, description: String, projectId: String, employer: String, client: String, solicitationNo: String, contractNo: String, cost: String }],
    education: [{ school: String, degree: String, field: String, start: String, end: String }],
    skills: [{ type: String }],
    certifications: [{ name: String, issuer: String, year: String }],
    languages: [{ name: String, level: String }],
    customSections: [{ heading: String, body: String }],
  },
  { timestamps: true }
);

export default mongoose.model<ISubResume>("SubResume", SubResumeSchema);
