-- CreateTable
CREATE TABLE "patient_brain_syncs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "item_ids" TEXT[],
    "synced_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patient_brain_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_brain_syncs_patient_id_key" ON "patient_brain_syncs"("patient_id");

-- CreateIndex
CREATE INDEX "patient_brain_syncs_organization_id_idx" ON "patient_brain_syncs"("organization_id");

-- AddForeignKey
ALTER TABLE "patient_brain_syncs" ADD CONSTRAINT "patient_brain_syncs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_brain_syncs" ADD CONSTRAINT "patient_brain_syncs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
