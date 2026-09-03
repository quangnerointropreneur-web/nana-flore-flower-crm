import type { StoreData } from "../types";

export function buildSeedStore(): StoreData {
  return {
    customers: [],
    recipients: [],
    events: [],
    products: [],
    orders: [],
    payments: [],
    expenses: [],
    invoices: [],
    staff: [],
    production: [],
    deliveries: [],
    logs: [],
    settings: {
      shop: {
        name: "Floré Flower Studio",
        address: "",
        hotline: "",
        website: "",
        facebook: "",
        bank: "",
        footer: "Cảm ơn quý khách đã tin tưởng Floré!",
      },
      invoice: {
        showPhone: true,
        showAddress: true,
        showDiscount: true,
        showShipping: true,
        showQr: true,
      },
      workflow: {
        productGroups: ["Hoa bó", "Hoa giỏ", "Hoa hộp", "Hoa bình", "Giỏ quả", "Giỏ quả & hoa", "Hoa sự kiện", "Theo yêu cầu"],
        defaultShippingFee: 50000,
        defaultFloristId: 0,
        defaultShipperId: 0,
      },
      notifications: {
        dueSoon: true,
        unpaid: true,
        specialOccasion: true,
      },
    },
  };
}
