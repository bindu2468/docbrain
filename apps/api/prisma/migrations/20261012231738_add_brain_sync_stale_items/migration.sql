-- AlterTable
ALTER TABLE "patient_brain_syncs" ADD COLUMN     "stale_item_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
