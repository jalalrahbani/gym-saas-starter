"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

export function OperationKeyInput() {
  const { pending } = useFormStatus();
  const [value, setValue] = useState("");
  const submissionStarted = useRef(false);

  useEffect(() => {
    setValue(crypto.randomUUID());
  }, []);

  useEffect(() => {
    if (pending) {
      submissionStarted.current = true;
      return;
    }

    if (submissionStarted.current) {
      submissionStarted.current = false;
      setValue(crypto.randomUUID());
    }
  }, [pending]);

  return <input type="hidden" name="operation_key" value={value} readOnly />;
}
