-- Template tokens a draft no longer carries, with the value each resolved to when the owner
-- removed it. A later change to that detail raises a review notice; literal text is never rewritten.
ALTER TABLE "JumpDraft" ADD COLUMN "detached" JSONB;
