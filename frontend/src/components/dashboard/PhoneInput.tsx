import { useRef, useState, type InputHTMLAttributes } from "react";
import { formatPhone, typingPhone } from "../../lib/phone";

/**
 * 2026-10-09 - every phone box: the number in the standard format, (614) 615-9181 or
 * +971 50 123 4567 (lib/phone.ts). It formats as it is typed at the end, and settles the format
 * when the box is left. A number saved before shows formatted too; it is only rewritten when it is
 * edited, so opening and leaving the box changes nothing.
 */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string | undefined | null;
  onChange: (value: string) => void;
};

export default function PhoneInput({ value, onChange, onFocus, onBlur, placeholder = "(000) 000-0000", ...rest }: Props) {
  // While the box has focus: what is being typed. Otherwise the stored value, formatted.
  const [text, setText] = useState<string | null>(null);
  const edited = useRef(false);
  const shown = text ?? formatPhone(value);
  return (
    <input
      {...rest}
      type="tel"
      inputMode="tel"
      autoComplete={rest.autoComplete ?? "tel"}
      placeholder={placeholder}
      value={shown}
      onFocus={(e) => { edited.current = false; setText(formatPhone(value)); onFocus?.(e); }}
      onChange={(e) => {
        let v = e.target.value.replace(/[^\d+()\-.\s/a-zA-Z#]/g, "");
        // Typing at the end: format as the number grows. Deleting or editing inside: left alone.
        if (e.target.selectionStart === v.length && v.length > (text ?? "").length) v = typingPhone(v);
        edited.current = true;
        setText(v);
        onChange(v);
      }}
      onBlur={(e) => {
        const typed = text ?? "";
        setText(null);
        if (edited.current) { const f = formatPhone(typed); if (f !== typed) onChange(f); }
        onBlur?.(e);
      }}
    />
  );
}
