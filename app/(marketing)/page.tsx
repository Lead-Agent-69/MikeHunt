"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
} from "framer-motion";
import Link from "next/link";
import { DNACarousel, type CarouselItem } from "@/components/ui/dna-carousel";
import { MikeHuntLogo } from "@/components/brand/MikeHuntLogo";
import {
  VerticalCarousel3D,
  type VerticalCarouselItem,
} from "@/components/ui/vertical-carousel-3d";
import {
  FanCardCarousel,
  type FanCardItem,
} from "@/components/ui/fan-card-carousel";
import {
  PolaroidGrid,
  type PolaroidFlipItem,
} from "@/components/ui/polaroid-flip-card";
import {
  FocusSliceCarousel,
  type FocusSliceItem,
} from "@/components/ui/focus-slice-carousel";
import {
  CinemaCarousel,
  type CinemaItem,
} from "@/components/ui/cinema-carousel";
import {
  StackDriftCarousel,
  type StackDriftItem,
} from "@/components/ui/stack-drift-carousel";
import {
  DrawerCardGrid,
  type DrawerCardItem,
} from "@/components/ui/ui-drawer-card";
import {
  LiveDNACarousel,
  LivePremiumCarousel,
  LiveEditorialGrid,
  LiveStats,
} from "@/components/ui/live-data-carousel";

// ── Sample Data ──
const feedItems = [
  {
    id: "1",
    image:
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80",
    title: "Porsche 911 Carrera",
    subtitle: "2019 · 12,400 miles",
    category: "Sports Car",
    price: "$89,900",
    profit: "$12,400",
  },
  {
    id: "2",
    image:
      "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80",
    title: "BMW M4 Competition",
    subtitle: "2021 · 8,200 miles",
    category: "Performance",
    price: "$72,500",
    profit: "$15,200",
  },
  {
    id: "3",
    image:
      "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80",
    title: "Audi RS6 Avant",
    subtitle: "2020 · 15,800 miles",
    category: "Wagon",
    price: "$78,900",
    profit: "$18,600",
  },
  {
    id: "4",
    image:
      "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80",
    title: "Mercedes-AMG GT",
    subtitle: "2018 · 22,100 miles",
    category: "Grand Tourer",
    price: "$95,000",
    profit: "$9,800",
  },
  {
    id: "5",
    image:
      "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80",
    title: "Tesla Model S Plaid",
    subtitle: "2022 · 5,400 miles",
    category: "Electric",
    price: "$115,000",
    profit: "$22,100",
  },
];

const showcaseItems: CarouselItem[] = [
  {
    id: "1",
    image:
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80",
    title: "Porsche 911 Carrera",
    subtitle: "2019 · 12,400 miles",
    category: "Sports Car",
    year: "2019",
    description:
      "Immaculate condition with full service history. Guards Red over Black leather.",
    cta: "View Deal",
  },
  {
    id: "2",
    image:
      "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80",
    title: "BMW M4 Competition",
    subtitle: "2021 · 8,200 miles",
    category: "Performance",
    year: "2021",
    description:
      "S58 twin-turbo inline-6. Portimao Blue with extended Merino leather.",
    cta: "View Deal",
  },
  {
    id: "3",
    image:
      "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80",
    title: "Audi RS6 Avant",
    subtitle: "2020 · 15,800 miles",
    category: "Wagon",
    year: "2020",
    description: "591hp twin-turbo V8 with quattro AWD.",
    cta: "View Deal",
  },
  {
    id: "4",
    image:
      "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80",
    title: "Mercedes-AMG GT",
    subtitle: "2018 · 22,100 miles",
    category: "Grand Tourer",
    year: "2018",
    description:
      "Handcrafted biturbo V8. Obsidian Black with Red Pepper interior.",
    cta: "View Deal",
  },
  {
    id: "5",
    image:
      "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80",
    title: "Tesla Model S Plaid",
    subtitle: "2022 · 5,400 miles",
    category: "Electric",
    year: "2022",
    description: "Tri-motor AWD. 0-60 in 1.99s. Full Self-Driving capability.",
    cta: "View Deal",
  },
];

const profileItems: PolaroidFlipItem[] = [
  {
    id: "p1",
    image:
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80",
    backImage:
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=400&q=60",
    title: "Porsche 911",
    subtitle: "2019",
    category: "Sports Car",
    description:
      "Immaculate condition with full service history. Guards Red over Black leather.",
  },
  {
    id: "p2",
    image:
      "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80",
    backImage:
      "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=400&q=60",
    title: "BMW M4",
    subtitle: "2021",
    category: "Performance",
    description: "S58 twin-turbo inline-6 producing 503hp. Portimao Blue.",
  },
  {
    id: "p3",
    image:
      "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80",
    backImage:
      "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=400&q=60",
    title: "Audi RS6",
    subtitle: "2020",
    category: "Wagon",
    description: "591hp twin-turbo V8 with quattro AWD.",
  },
  {
    id: "p4",
    image:
      "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80",
    backImage:
      "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=400&q=60",
    title: "AMG GT",
    subtitle: "2018",
    category: "Grand Tourer",
    description: "Handcrafted biturbo V8. Obsidian Black.",
  },
  {
    id: "p5",
    image:
      "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80",
    backImage:
      "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=400&q=60",
    title: "Tesla Plaid",
    subtitle: "2022",
    category: "Electric",
    description: "Tri-motor AWD. 0-60 in 1.99s.",
  },
];

const contentItems: CinemaItem[] = [
  {
    id: "c1",
    image:
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80",
    title: "Porsche 911 Carrera",
    subtitle: "2019 · 12,400 miles",
    category: "Sports Car",
    description: "Immaculate condition with full service history.",
    year: "2019",
  },
  {
    id: "c2",
    image:
      "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80",
    title: "BMW M4 Competition",
    subtitle: "2021 · 8,200 miles",
    category: "Performance",
    description: "S58 twin-turbo inline-6. Portimao Blue.",
    year: "2021",
  },
  {
    id: "c3",
    image:
      "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80",
    title: "Audi RS6 Avant",
    subtitle: "2020 · 15,800 miles",
    category: "Wagon",
    description: "591hp twin-turbo V8 with quattro AWD.",
    year: "2020",
  },
  {
    id: "c4",
    image:
      "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80",
    title: "Mercedes-AMG GT",
    subtitle: "2018 · 22,100 miles",
    category: "Grand Tourer",
    description: "Handcrafted biturbo V8. Obsidian Black.",
    year: "2018",
  },
  {
    id: "c5",
    image:
      "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80",
    title: "Tesla Model S Plaid",
    subtitle: "2022 · 5,400 miles",
    category: "Electric",
    description: "Tri-motor AWD. 0-60 in 1.99s.",
    year: "2022",
  },
];

const marketItems: StackDriftItem[] = [
  {
    id: "sd1",
    image:
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80",
    title: "Porsche 911 Carrera",
    subtitle: "2019 · 12,400 miles",
    category: "Sports Car",
    description: "Immaculate condition with full service history.",
  },
  {
    id: "sd2",
    image:
      "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80",
    title: "BMW M4 Competition",
    subtitle: "2021 · 8,200 miles",
    category: "Performance",
    description: "S58 twin-turbo inline-6. Portimao Blue.",
  },
  {
    id: "sd3",
    image:
      "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80",
    title: "Audi RS6 Avant",
    subtitle: "2020 · 15,800 miles",
    category: "Wagon",
    description: "591hp twin-turbo V8 with quattro AWD.",
  },
  {
    id: "sd4",
    image:
      "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80",
    title: "Mercedes-AMG GT",
    subtitle: "2018 · 22,100 miles",
    category: "Grand Tourer",
    description: "Handcrafted biturbo V8. Obsidian Black.",
  },
  {
    id: "sd5",
    image:
      "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80",
    title: "Tesla Model S Plaid",
    subtitle: "2022 · 5,400 miles",
    category: "Electric",
    description: "Tri-motor AWD. 0-60 in 1.99s.",
  },
];

const drawerItems: DrawerCardItem[] = [
  {
    id: "dc1",
    image:
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80",
    title: "Porsche 911 Carrera",
    subtitle: "2019 · 12,400 miles",
    category: "Sports Car",
    description:
      "Immaculate condition with full service history. Guards Red over Black leather.",
    specs: [
      { label: "Engine", value: "3.0L Twin-Turbo Flat-6" },
      { label: "Power", value: "443 hp" },
      { label: "Transmission", value: "8-speed PDK" },
      { label: "0-60 mph", value: "3.2 sec" },
      { label: "Top Speed", value: "191 mph" },
    ],
  },
  {
    id: "dc2",
    image:
      "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80",
    title: "BMW M4 Competition",
    subtitle: "2021 · 8,200 miles",
    category: "Performance",
    description:
      "S58 twin-turbo inline-6. Portimao Blue with extended Merino leather.",
    specs: [
      { label: "Engine", value: "3.0L Twin-Turbo Inline-6" },
      { label: "Power", value: "503 hp" },
      { label: "Transmission", value: "8-speed Auto" },
      { label: "0-60 mph", value: "3.8 sec" },
      { label: "Top Speed", value: "180 mph" },
    ],
  },
  {
    id: "dc3",
    image:
      "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80",
    title: "Audi RS6 Avant",
    subtitle: "2020 · 15,800 miles",
    category: "Wagon",
    description: "591hp twin-turbo V8 with quattro AWD.",
    specs: [
      { label: "Engine", value: "4.0L Twin-Turbo V8" },
      { label: "Power", value: "591 hp" },
      { label: "Transmission", value: "8-speed Auto" },
      { label: "0-60 mph", value: "3.5 sec" },
      { label: "Top Speed", value: "190 mph" },
    ],
  },
  {
    id: "dc4",
    image:
      "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80",
    title: "Mercedes-AMG GT",
    subtitle: "2018 · 22,100 miles",
    category: "Grand Tourer",
    description:
      "Handcrafted biturbo V8. Obsidian Black with Red Pepper interior.",
    specs: [
      { label: "Engine", value: "4.0L Twin-Turbo V8" },
      { label: "Power", value: "523 hp" },
      { label: "Transmission", value: "7-speed DCT" },
      { label: "0-60 mph", value: "3.7 sec" },
      { label: "Top Speed", value: "193 mph" },
    ],
  },
  {
    id: "dc5",
    image:
      "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80",
    title: "Tesla Model S Plaid",
    subtitle: "2022 · 5,400 miles",
    category: "Electric",
    description: "Tri-motor AWD. 0-60 in 1.99s. Full Self-Driving capability.",
    specs: [
      { label: "Motors", value: "Tri-Motor AWD" },
      { label: "Power", value: "1,020 hp" },
      { label: "Range", value: "396 miles" },
      { label: "0-60 mph", value: "1.99 sec" },
      { label: "Top Speed", value: "200 mph" },
    ],
  },
];

// ── Feed Card (TikTok-style) ──
function FeedCard({
  item,
  isActive,
}: {
  item: (typeof feedItems)[0];
  isActive: boolean;
}) {
  return (
    <motion.div
      className="relative w-full h-full snap-start flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: isActive ? 1 : 0.5 }}
      transition={{ duration: 0.3 }}
    >
      <div className="relative w-full h-full">
        <img
          src={item.image}
          alt={item.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

        {/* Content overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 20 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <span className="inline-block px-3 py-1 mb-3 text-[10px] font-bold uppercase tracking-widest text-[var(--amber)] bg-[var(--amber-lo)] rounded-full">
              {item.category}
            </span>
            <h2 className="text-2xl md:text-4xl font-black text-white mb-2 text-shadow-lg">
              {item.title}
            </h2>
            <p className="text-sm text-white/70 mb-4">{item.subtitle}</p>
            <div className="flex items-center gap-4">
              <span className="text-2xl font-black text-[var(--amber)]">
                {item.price}
              </span>
              <span className="text-sm font-bold text-[var(--green)]">
                +{item.profit} profit
              </span>
            </div>
          </motion.div>
        </div>

        {/* Action rail */}
        <div className="absolute right-4 bottom-24 flex flex-col gap-4">
          <button className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-colors">
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
          <button className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-colors">
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-colors">
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Page ──
export default function HomePage() {
  const [activeSection, setActiveSection] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const sections = [
    { id: "feed", label: "Feed" },
    { id: "showcase", label: "Showcase" },
    { id: "profiles", label: "Profiles" },
    { id: "content", label: "Content" },
    { id: "market", label: "Market" },
  ];

  return (
    <div className="min-h-screen bg-[var(--s1)]">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 frosted border-b border-[var(--b1)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <MikeHuntLogo size="sm" />
          </Link>
          <div className="flex items-center gap-1">
            {sections.map((section, i) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(i)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  activeSection === i
                    ? "bg-[var(--grad-amber)] text-[#0A0A0F]"
                    : "text-[var(--t4)] hover:text-[var(--t1)]"
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Feed Section — TikTok-style vertical scroll */}
      <section className="h-screen overflow-y-scroll snap-y snap-mandatory scrollbar-hide">
        {feedItems.map((item, i) => (
          <FeedCard key={item.id} item={item} isActive={true} />
        ))}
      </section>

      {/* Showcase Section — DNA Helix */}
      <section className="min-h-screen py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <span className="inline-block px-4 py-1.5 mb-4 text-xs font-bold uppercase tracking-widest text-[var(--amber)] bg-[var(--amber-lo)] rounded-full">
              Featured
            </span>
            <h1 className="text-hero font-black text-[var(--t1)] mb-4">
              <span className="text-gradient">DNA Showcase</span>
            </h1>
            <p className="text-lg text-[var(--t4)] max-w-2xl mx-auto">
              Drag, swipe, or scroll to explore our signature 3D helix carousel
            </p>
          </motion.div>

          <div className="glass-panel p-6 md:p-10">
            <DNACarousel
              items={showcaseItems}
              autoPlay={true}
              autoPlaySpeed={4000}
              depth={300}
              curve={1}
              helixSpread={1}
              perspective={1200}
              imageWidth={280}
              imageHeight={380}
              imageRadius={20}
              blur={6}
              rgbSplit={2}
              inactiveOpacity={0.35}
              shadow={true}
              shadowStrength={0.25}
            />
          </div>
        </div>
      </section>

      {/* Profiles Section — Polaroid + Fan Cards */}
      <section className="min-h-screen py-20 px-4 bg-[var(--s2)]">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <span className="inline-block px-4 py-1.5 mb-4 text-xs font-bold uppercase tracking-widest text-[var(--amber)] bg-[var(--amber-lo)] rounded-full">
              Team
            </span>
            <h2 className="text-display font-black text-[var(--t1)] mb-4">
              Profiles
            </h2>
            <p className="text-[var(--t4)] max-w-2xl mx-auto">
              Polaroid flip cards and fan card carousel — personal,
              approachable, memorable
            </p>
          </motion.div>

          <div className="glass-panel p-6 md:p-10 mb-12">
            <h3 className="text-lg font-bold text-[var(--t1)] mb-6">
              Fan Card Carousel
            </h3>
            <FanCardCarousel
              items={profileItems.map((p) => ({
                id: p.id,
                image: p.image,
                title: p.title,
                category: p.category,
              }))}
              autoPlay={true}
              autoPlaySpeed={3000}
              maxRotation={60}
              radius={300}
            />
          </div>

          <div className="glass-panel p-6 md:p-10">
            <h3 className="text-lg font-bold text-[var(--t1)] mb-6">
              Polaroid Flip Cards
            </h3>
            <PolaroidGrid items={profileItems} />
          </div>
        </div>
      </section>

      {/* Content Section — Cinema Carousel */}
      <section className="min-h-screen py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <span className="inline-block px-4 py-1.5 mb-4 text-xs font-bold uppercase tracking-widest text-[var(--amber)] bg-[var(--amber-lo)] rounded-full">
              Content
            </span>
            <h2 className="text-display font-black text-[var(--t1)] mb-4">
              Cinematic Editorial
            </h2>
            <p className="text-[var(--t4)] max-w-2xl mx-auto">
              Cinema carousel with film strip navigation — immersive
              storytelling
            </p>
          </motion.div>

          <div className="glass-panel p-6 md:p-10">
            <CinemaCarousel
              items={contentItems}
              autoPlay={true}
              autoPlaySpeed={5000}
            />
          </div>
        </div>
      </section>

      {/* Market Section — Stack Drift + Drawer Cards */}
      <section className="min-h-screen py-20 px-4 bg-[var(--s2)]">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <span className="inline-block px-4 py-1.5 mb-4 text-xs font-bold uppercase tracking-widest text-[var(--amber)] bg-[var(--amber-lo)] rounded-full">
              Market
            </span>
            <h2 className="text-display font-black text-[var(--t1)] mb-4">
              Market & Tools
            </h2>
            <p className="text-[var(--t4)] max-w-2xl mx-auto">
              Stack drift carousel and drawer cards — dynamic, organized,
              shoppable
            </p>
          </motion.div>

          <div className="glass-panel p-6 md:p-10 mb-12">
            <h3 className="text-lg font-bold text-[var(--t1)] mb-6">
              Stack Drift Carousel
            </h3>
            <StackDriftCarousel
              items={marketItems}
              autoPlay={true}
              autoPlaySpeed={3000}
            />
          </div>

          <div className="glass-panel p-6 md:p-10">
            <h3 className="text-lg font-bold text-[var(--t1)] mb-6">
              Drawer Card Grid
            </h3>
            <DrawerCardGrid items={drawerItems} columns={3} />
          </div>
        </div>
      </section>

      {/* Live Stats */}
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <LiveStats />
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-[var(--b1)]">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm text-[var(--t4)]">
            Built with Next.js, Framer Motion, and Tailwind CSS
          </p>
          <p className="text-xs text-[var(--t5)] mt-2">
            MikeHunt — Premium Vehicle Sourcing Intelligence
          </p>
        </div>
      </footer>
    </div>
  );
}
