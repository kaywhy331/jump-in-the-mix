ALTER TABLE "WorkspaceProfile"
ADD COLUMN "products" JSONB,
ADD COLUMN "senderDetails" JSONB;

UPDATE "WorkspaceProfile"
SET "products" = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', 'Product or service ' || ordinal, 'value', value) ORDER BY ordinal), '[]'::jsonb)
  FROM (VALUES (1, "product1"), (2, "product2"), (3, "product3"), (4, "product4"), (5, "product5")) AS legacy(ordinal, value)
  WHERE value IS NOT NULL AND btrim(value) <> ''
), "senderDetails" = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', 'Sender detail ' || ordinal, 'value', value) ORDER BY ordinal), '[]'::jsonb)
  FROM (VALUES (1, "myCustom1"), (2, "myCustom2"), (3, "myCustom3")) AS legacy(ordinal, value)
  WHERE value IS NOT NULL AND btrim(value) <> ''
);
