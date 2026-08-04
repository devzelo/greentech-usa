import mongoose, { Schema, Document } from "mongoose";

export interface IEmployee extends Document {
  empId: string;
  name: string;
}

const EmployeeSchema = new Schema<IEmployee>({
  empId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
});

export default mongoose.model<IEmployee>("Employee", EmployeeSchema);
