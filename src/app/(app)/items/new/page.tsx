"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ItemForm, type ItemFormValue } from "@/components/item-form";

export default function NewItemPage() {
  return (
    <Suspense fallback={null}>
      <NewItemInner />
    </Suspense>
  );
}

function NewItemInner() {
  const sp = useSearchParams();
  const presetBarcode = sp.get("barcode") ?? "";
  const presetName = sp.get("name") ?? "";
  const presetDescription = sp.get("description") ?? "";
  const presetBrand = sp.get("brand") ?? "";

  // Compose description from brand + description if both came in from the UPC lookup.
  const description = [presetBrand, presetDescription].filter(Boolean).join(" — ");

  const hasPreset = presetBarcode || presetName || description;

  const initial: ItemFormValue | undefined = hasPreset
    ? {
        name: presetName,
        description,
        barcode: presetBarcode,
        sku: "",
        quantity: 0,
        unit: "each",
        lotNumber: "",
        expirationDate: "",
        lowStockThreshold: "",
        locationId: "",
        categoryId: "",
        notes: "",
        photoUrl: null,
        returnable: false,
        tileDeviceId: "",
        tagIds: [],
      }
    : undefined;

  return <ItemForm mode="create" initial={initial} />;
}
