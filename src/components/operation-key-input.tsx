"use client";

import { useEffect, useState } from "react";

export function OperationKeyInput() {
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(crypto.randomUUID());
  }, []);

  return <input type="hidden" name="operation_key" value={value} readOnly />;
}
