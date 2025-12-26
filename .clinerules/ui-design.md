---
name: ui-design
description: UI/UX design guidelines based on Atomic Design principles for Fullstack AgentCore frontend
---

# UI Design Guide

This document defines the UI/UX design principles and component guidelines for the Fullstack AgentCore frontend, based on Atomic Design methodology.

## Design Principles

### 1. Clarity (明確さ)
- Use clear, concise language
- Provide immediate visual feedback for user actions
- Make the system state always visible
- Avoid ambiguous icons or labels

### 2. Consistency (一貫性)
- Use consistent patterns across all components
- Maintain uniform spacing, typography, and color usage
- Follow established interaction patterns
- Reuse components rather than creating new ones

### 3. Efficiency (効率性)
- Minimize the number of steps to complete tasks
- Provide keyboard shortcuts for power users
- Enable batch operations where applicable
- Remember user preferences

### 4. Accessibility (アクセシビリティ)
- Maintain WCAG 2.1 AA compliance
- Ensure proper color contrast ratios (4.5:1 for text)
- Support keyboard navigation
- Provide proper ARIA labels and semantic HTML

## Atomic Design Structure

The frontend follows Atomic Design methodology with the following structure:

```
packages/frontend/src/
├── components/
│   ├── ui/                    # Atoms & Molecules
│   │   ├── Modal/             # Molecule: Composite modal system
│   │   ├── LoadingIndicator/  # Atom: Loading spinner
│   │   ├── IconPicker/        # Molecule: Icon selection UI
│   │   ├── SidebarTabs/       # Molecule: Tab navigation
│   │   └── Tooltip/           # Atom: Tooltip component
│   │
│   └── (root level)           # Organisms
│       ├── ChatContainer.tsx
│       ├── MessageList.tsx
│       ├── MessageInput.tsx
│       ├── Message.tsx
│       ├── SessionSidebar.tsx
│       ├── AgentForm.tsx
│       └── ...
│
├── layouts/                   # Templates
├── pages/                     # Pages
├── features/                  # Feature modules
└── hooks/                     # Custom hooks
```

### Atoms
**Definition**: Basic building blocks that cannot be broken down further without losing meaning.

**Current Examples**:
- `LoadingIndicator` - Spinning loader animation
- `Tooltip` - Contextual hint overlay
- `ModalHeader`, `ModalContent`, `ModalFooter` - Modal parts

**Guidelines**:
- Should be highly reusable
- Accept minimal, focused props
- No business logic
- Pure presentation components

**Example**:
```tsx
// Good: Simple, reusable button atom
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'danger';
  size: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button: React.FC<ButtonProps> = ({ variant, size, children, onClick }) => {
  const baseStyles = 'rounded-xl font-medium transition-colors';
  const variantStyles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
```

### Molecules
**Definition**: Groups of atoms functioning together as a unit.

**Current Examples**:
- `Modal` - Combines ModalHeader, ModalContent, ModalFooter
- `SidebarTabs` - Tab navigation with content switching
- `IconPicker` - Icon selection interface

**Guidelines**:
- Combine multiple atoms with specific purpose
- Handle simple interactions
- Can have internal state for UI logic
- Should be reusable across features

**Example**:
```tsx
// Good: SearchField molecule combining input and icon
interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
}) => {
  return (
    <div className="relative">
      <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-10"
      />
    </div>
  );
};
```

### Organisms
**Definition**: Complex UI components composed of groups of molecules and atoms.

**Current Examples**:
- `ChatContainer` - Main chat interface
- `MessageList` - List of chat messages
- `MessageInput` - Message composition area
- `SessionSidebar` - Session navigation sidebar
- `AgentForm` - Agent configuration form

**Guidelines**:
- Contain business logic and feature-specific behavior
- Connect to state management (stores, hooks)
- Orchestrate multiple molecules and atoms
- Can fetch data and handle API calls

**Example Structure**:
```tsx
// ChatContainer organism
export const ChatContainer: React.FC = () => {
  const messages = useMessages();
  const sendMessage = useSendMessage();

  return (
    <div className="flex flex-col h-full">
      <ChatHeader />
      <MessageList messages={messages} />
      <MessageInput onSend={sendMessage} />
    </div>
  );
};
```

### Templates
**Definition**: Page-level layouts defining structure without specific content.

**Location**: `layouts/`

**Guidelines**:
- Define page structure and grid
- Handle responsive breakpoints
- No business logic
- Slot-based composition

**Example**:
```tsx
// Main layout template
interface MainLayoutProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ sidebar, main }) => {
  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r">{sidebar}</aside>
      <main className="flex-1 overflow-auto">{main}</main>
    </div>
  );
};
```

### Pages
**Definition**: Specific instances of templates with real content.

**Location**: `pages/`

**Guidelines**:
- Connect templates with data
- Handle routing
- Manage page-level state
- Implement authentication guards

## Design Tokens

### Color System

Based on `tailwind.config.js`:

```typescript
// Gray Scale
gray-50:  #f9fafb  // Backgrounds
gray-100: #f3f4f6  // Subtle backgrounds
gray-200: #e5e7eb  // Borders
gray-300: #d1d5db  // Disabled states
gray-400: #9ca3af  // Placeholders
gray-500: #6b7280  // Secondary text
gray-600: #4b5563  // Body text
gray-700: #374151  // Headings
gray-800: #1f2937  // Dark backgrounds
gray-900: #111827  // Primary text
```

**Usage Guidelines**:
- Use `gray-900` for primary text
- Use `gray-600` for secondary text
- Use `gray-200` for borders
- Use `gray-50/100` for backgrounds
- Maintain minimum 4.5:1 contrast ratio for text

### Typography

```typescript
// Font Family
fontFamily: {
  sans: ['ui-rounded', 'system-ui', 'sans-serif']
}

// Font Sizes (Tailwind defaults)
text-xs:   0.75rem   (12px)
text-sm:   0.875rem  (14px)
text-base: 1rem      (16px)
text-lg:   1.125rem  (18px)
text-xl:   1.25rem   (20px)
text-2xl:  1.5rem    (24px)
text-3xl:  1.875rem  (30px)
```

**Usage Guidelines**:
- Body text: `text-base` (16px)
- Secondary text: `text-sm` (14px)
- Buttons: `text-sm` or `text-base`
- Headings: `text-xl` to `text-3xl`
- Use `font-medium` or `font-semibold` for emphasis

### Spacing System

Follow 4px base unit:

```typescript
// Tailwind spacing scale
0.5: 2px    (0.125rem)
1:   4px    (0.25rem)
2:   8px    (0.5rem)
3:   12px   (0.75rem)
4:   16px   (1rem)
6:   24px   (1.5rem)
8:   32px   (2rem)
12:  48px   (3rem)
16:  64px   (4rem)
```

**Usage Guidelines**:
- Minimum touch target: `h-12 w-12` (48px)
- Default padding: `p-4` (16px)
- Section spacing: `gap-6` or `gap-8`
- Consistent spacing within component variants

### Border Radius

```typescript
rounded:    0.25rem  (4px)
rounded-md: 0.375rem (6px)
rounded-lg: 0.5rem   (8px)
rounded-xl: 0.75rem  (12px)
rounded-2xl: 1rem    (16px)
rounded-3xl: 1.5rem  (24px)
```

**Usage Guidelines**:
- Buttons: `rounded-xl` (12px)
- Cards: `rounded-2xl` (16px)
- Modals: `rounded-3xl` (24px)
- Small elements: `rounded-lg` (8px)

### Shadows (Elevation)

```typescript
// Elevation levels
shadow-sm:  0 1px 2px rgba(0,0,0,0.05)     // Subtle elevation
shadow:     0 1px 3px rgba(0,0,0,0.1)      // Default cards
shadow-md:  0 4px 6px rgba(0,0,0,0.1)      // Elevated cards
shadow-lg:  0 10px 15px rgba(0,0,0,0.1)    // Modals
shadow-xl:  0 20px 25px rgba(0,0,0,0.1)    // Popovers
```

## Component Guidelines

### Naming Conventions

```tsx
// Component files: PascalCase
UserProfile.tsx
MessageInput.tsx

// Component names: Match file name
export const UserProfile: React.FC<UserProfileProps> = () => { ... };

// Props interface: ComponentName + Props
interface UserProfileProps {
  userId: string;
}
```

### Props Design

**Good practices**:
```tsx
// 1. Use discriminated unions for variants
interface ButtonProps {
  variant: 'primary' | 'secondary';
  size: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

// 2. Make optional props explicit
interface CardProps {
  title: string;
  subtitle?: string;  // Optional
  actions?: React.ReactNode;
}

// 3. Use composition over configuration
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;  // Allow flexible content
}
```

### Component Composition

**Prefer composition**:
```tsx
// Good: Composable structure
<Modal isOpen={isOpen} onClose={onClose}>
  <ModalHeader>Title</ModalHeader>
  <ModalContent>Content here</ModalContent>
  <ModalFooter>
    <Button onClick={onClose}>Close</Button>
  </ModalFooter>
</Modal>

// Avoid: Monolithic props
<Modal
  title="Title"
  content="Content"
  buttons={[{ label: 'Close', onClick: onClose }]}
/>
```

### State Management

```tsx
// Component-level state: useState
const [isOpen, setIsOpen] = useState(false);

// Derived state: useMemo
const filteredItems = useMemo(
  () => items.filter(item => item.visible),
  [items]
);

// Global state: Zustand stores
const messages = useMessagesStore(state => state.messages);

// Server state: React Query (if adopted)
const { data, isLoading } = useQuery(['messages'], fetchMessages);
```

## Accessibility

### Keyboard Navigation

- All interactive elements must be keyboard accessible
- Use proper `tabindex` (0 or -1)
- Implement focus management in modals and dialogs
- Provide skip links for main content

```tsx
// Good: Keyboard accessible
<button
  onClick={handleClick}
  onKeyDown={(e) => e.key === 'Enter' && handleClick()}
>
  Click me
</button>
```

### ARIA Labels

```tsx
// Form inputs
<input
  type="text"
  aria-label="Search messages"
  placeholder="Search..."
/>

// Icon buttons
<button aria-label="Close modal">
  <XIcon />
</button>

// Status indicators
<div role="status" aria-live="polite">
  Loading...
</div>
```

### Semantic HTML

```tsx
// Good: Semantic elements
<nav>
  <ul>
    <li><a href="/home">Home</a></li>
  </ul>
</nav>

<article>
  <h2>Article Title</h2>
  <p>Content...</p>
</article>

// Avoid: Generic divs
<div className="navigation">
  <div className="link">Home</div>
</div>
```

## Animation & Interaction

### Transition Guidelines

```tsx
// Defined in tailwind.config.js
animation: {
  'subtle-fade-in': 'subtle-fade-in 0.2s ease-out',
}

keyframes: {
  'subtle-fade-in': {
    '0%': { opacity: '0.5' },
    '100%': { opacity: '1' },
  },
}
```

**Usage**:
```tsx
// Fade in on mount
<div className="animate-subtle-fade-in">
  Content
</div>

// Hover transitions
<button className="transition-colors hover:bg-blue-700">
  Hover me
</button>
```

### Micro-interactions

- Button press: Scale down slightly (`scale-95`)
- Hover states: Subtle color change with `transition-colors`
- Loading states: Spinning animation or skeleton screens
- Success feedback: Brief green highlight or checkmark

### Performance

- Use `transform` and `opacity` for animations (GPU accelerated)
- Avoid animating `width`, `height`, or `margin`
- Use `will-change` sparingly
- Prefer CSS transitions over JavaScript animations

## Component Testing

### Visual Regression

```tsx
// Storybook stories for visual testing
export const Default = () => <Button variant="primary">Click me</Button>;
export const Disabled = () => <Button disabled>Disabled</Button>;
export const Loading = () => <Button isLoading>Loading</Button>;
```

### Accessibility Testing

```tsx
// Use jest-axe for automated a11y tests
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';

test('Button has no a11y violations', async () => {
  const { container } = render(<Button>Click me</Button>);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

## Resources

- [Atomic Design by Brad Frost](https://atomicdesign.bradfrost.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [React Accessibility](https://react.dev/learn/accessibility)
