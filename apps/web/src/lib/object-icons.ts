import { 
  Users, 
  Building2, 
  User, 
  FileSignature, 
  Target, 
  FileText, 
  ShoppingCart,
  Box,
  HelpCircle
} from 'lucide-react';

export function getObjectIcon(objectApiName: string) {
  switch (objectApiName) {
    case 'Lead':
      return Users;
    case 'Account':
      return Building2;
    case 'Contact':
      return User;
    case 'Contract':
      return FileSignature;
    case 'Opportunity':
      return Target;
    case 'Quote':
      return FileText;
    case 'Order':
      return ShoppingCart;
    case 'Product':
      return Box;
    default:
      return HelpCircle;
  }
}
