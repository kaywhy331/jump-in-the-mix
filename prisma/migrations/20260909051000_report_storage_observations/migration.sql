-- Physical storage observations are independent of recalculated activity cohorts.
CREATE TABLE "ReportStorageObservation" (
  "day" DATE NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "databaseBytes" BIGINT NOT NULL,
  CONSTRAINT "ReportStorageObservation_pkey" PRIMARY KEY ("day"),
  CONSTRAINT "ReportStorageObservation_valid" CHECK ("databaseBytes">=0 AND "observedAt"::date="day")
);
