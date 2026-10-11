
export interface ISidebarItem {
  title: string;
  hasDropdown: boolean;
  icon?: React.ElementType;
  route?: string;
  subItems?: ISidebarItem[];
}