import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const billingTable = pgTable("billing", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  classId: integer("class_id"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  reason: text("reason").notNull(),
  dueDate: text("due_date"),
  paidDate: text("paid_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBillingSchema = createInsertSchema(billingTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBilling = z.infer<typeof insertBillingSchema>;
export type Billing = typeof billingTable.$inferSelect;
