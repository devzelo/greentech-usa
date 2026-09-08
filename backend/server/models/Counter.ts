import mongoose, { Schema } from "mongoose";

// A persistent, monotonic sequence keyed by name (CR-P (23)).
//
// Numbers that are printed on legal paperwork must never be reused. An agreement can be sent out
// as AG-0007, get cancelled, and be revised — the next agreement still has to be AG-0008, not
// AG-0007 again. Deriving the next number from "max existing + 1" cannot promise that, because
// deleting or archiving the highest row hands its number to the next one. So the sequence lives
// on its own and only ever moves forward.
// The _id is the sequence name (a string, not an ObjectId), so this is a plain shape rather than
// a mongoose Document interface.
export interface ICounter {
  _id: string;   // the sequence name, e.g. "agreementNo"
  seq: number;   // the last number handed out
}

const CounterSchema = new Schema<ICounter>(
  { _id: { type: String, required: true }, seq: { type: Number, default: 0 } },
  { versionKey: false }
);

const Counter = mongoose.model<ICounter>("Counter", CounterSchema);

/**
 * Reserve and return the next number in `key`.
 *
 * `$inc` with `upsert` is a single atomic document update, so two agreements created at the same
 * moment can never be handed the same number.
 *
 * `startAt` seeds a brand-new counter (it is ignored once the counter exists), which lets an
 * existing database that already has numbered rows continue past its highest one instead of
 * restarting at 1.
 */
export async function nextSequence(key: string, startAt = 0): Promise<number> {
  const doc = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 }, $setOnInsert: {} },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  // A counter created just now starts at 1. If the database already holds higher numbers, jump
  // the counter past them once, then carry on normally.
  if (doc.seq === 1 && startAt > 0) {
    const bumped = await Counter.findOneAndUpdate({ _id: key }, { $set: { seq: startAt + 1 } }, { new: true });
    return bumped?.seq ?? startAt + 1;
  }
  return doc.seq;
}

export default Counter;
