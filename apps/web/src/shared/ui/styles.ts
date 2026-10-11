export const inputClass =
  'w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-black/50 disabled:bg-black/5';

const buttonVariants = {
  primary: 'bg-black text-white hover:bg-black/80',
  secondary: 'border border-black/15 hover:bg-[#f3f5f7]',
  danger: 'text-red-700 hover:bg-red-50',
};

export const buttonClass = (variant: ButtonVariant = 'primary') =>
  `inline-flex cursor-pointer items-center justify-center rounded-md px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]}`;

export type ButtonVariant = keyof typeof buttonVariants;
