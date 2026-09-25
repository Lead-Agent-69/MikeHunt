# DealerHunt Scraping Infrastructure Plan

## Overview

Comprehensive scraping infrastructure designed to handle 18+ vehicle data sources with real-time processing, proxy rotation, and enterprise-grade scalability.

## 1. Scraping Architecture Overview

### High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Scheduler     │    │   Proxy Pool    │    │  Browser Pool   │
│                 │    │                 │    │                 │
│ • Cron Jobs     │───▶│ • Rotating IPs  │───▶│ • Playwright    │
│ • Priority Q    │    │ • Geo-targeting │    │ • Pre-warmed    │
│ • Rate Limits   │    │ • Health Checks │    │ • Resource Mgmt │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Worker Nodes   │    │   Data Pipeline  │    │   Storage Layer  │
│                 │    │                 │    │                 │
│ • Kubernetes    │    │ • Kafka/Redis   │    │ • PostgreSQL    │
│ • Docker        │    │ • Validation    │    │ • TimescaleDB   │
│ • Resource Mgmt │    │ • Deduplication │    │ • S3 Archive    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 2. Source Classification & Strategy

### Source Categories

```typescript
interface ScrapingSource {
  id: string;
  name: string;
  type: "auction" | "marketplace" | "dealer" | "parts";
  priority: "high" | "medium" | "low";
  frequency: number; // minutes
  complexity: "simple" | "moderate" | "complex";
  authentication: "none" | "basic" | "oauth" | "custom";
  rateLimit: {
    requests: number;
    window: number; // seconds
  };
  dataPoints: string[];
  geographic: "national" | "regional" | "local";
  volume: "high" | "medium" | "low";
}

const SCRAPING_SOURCES: ScrapingSource[] = [
  // High Priority Auctions (15-min intervals)
  {
    id: "copart",
    name: "Copart Auction",
    type: "auction",
    priority: "high",
    frequency: 15,
    complexity: "moderate",
    authentication: "custom",
    rateLimit: { requests: 100, window: 300 },
    dataPoints: ["vin", "price", "mileage", "location", "condition"],
    geographic: "national",
    volume: "high",
  },
  {
    id: "iaa",
    name: "IAA Insurance",
    type: "auction",
    priority: "high",
    frequency: 15,
    complexity: "moderate",
    authentication: "custom",
    rateLimit: { requests: 80, window: 300 },
    dataPoints: ["vin", "price", "damage", "location"],
    geographic: "national",
    volume: "high",
  },
  {
    id: "adesa",
    name: "ADESA Auction",
    type: "auction",
    priority: "high",
    frequency: 20,
    complexity: "complex",
    authentication: "oauth",
    rateLimit: { requests: 60, window: 300 },
    dataPoints: ["vin", "price", "condition", "location"],
    geographic: "national",
    volume: "high",
  },
  {
    id: "manheim",
    name: "Manheim Auction",
    type: "auction",
    priority: "high",
    frequency: 20,
    complexity: "complex",
    authentication: "oauth",
    rateLimit: { requests: 50, window: 300 },
    dataPoints: ["vin", "price", "grade", "location"],
    geographic: "national",
    volume: "high",
  },

  // Medium Priority Marketplaces (30-min intervals)
  {
    id: "facebook_marketplace",
    name: "Facebook Marketplace",
    type: "marketplace",
    priority: "medium",
    frequency: 30,
    complexity: "moderate",
    authentication: "oauth",
    rateLimit: { requests: 200, window: 300 },
    dataPoints: ["price", "location", "condition", "images"],
    geographic: "regional",
    volume: "medium",
  },
  {
    id: "craigslist",
    name: "Craigslist",
    type: "marketplace",
    priority: "medium",
    frequency: 30,
    complexity: "simple",
    authentication: "none",
    rateLimit: { requests: 300, window: 300 },
    dataPoints: ["price", "location", "description"],
    geographic: "local",
    volume: "medium",
  },
  {
    id: "ebay_motors",
    name: "eBay Motors",
    type: "marketplace",
    priority: "medium",
    frequency: 45,
    complexity: "moderate",
    authentication: "oauth",
    rateLimit: { requests: 150, window: 300 },
    dataPoints: ["price", "location", "condition", "seller"],
    geographic: "national",
    volume: "medium",
  },

  // Low Priority Independent Dealers (60-min intervals)
  {
    id: "independent_dealers",
    name: "Independent Dealers (847+ sites)",
    type: "dealer",
    priority: "low",
    frequency: 60,
    complexity: "simple",
    authentication: "none",
    rateLimit: { requests: 500, window: 300 },
    dataPoints: ["price", "location", "contact", "inventory"],
    geographic: "local",
    volume: "low",
  },

  // Parts Marketplaces (Daily intervals)
  {
    id: "carparts",
    name: "CarParts.com",
    type: "parts",
    priority: "medium",
    frequency: 1440, // 24 hours
    complexity: "moderate",
    authentication: "api",
    rateLimit: { requests: 1000, window: 3600 },
    dataPoints: ["part_number", "price", "availability", "fitment"],
    geographic: "national",
    volume: "high",
  },
  {
    id: "car_part",
    name: "Car-Part.com",
    type: "parts",
    priority: "medium",
    frequency: 1440,
    complexity: "moderate",
    authentication: "api",
    rateLimit: { requests: 800, window: 3600 },
    dataPoints: ["part_number", "price", "interchange", "location"],
    geographic: "national",
    volume: "high",
  },
];
```

## 3. Infrastructure Components

### 3.1 Kubernetes Deployment

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: scraping
  labels:
    name: scraping

---
# scraper-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: scraper-workers
  namespace: scraping
spec:
  replicas: 10
  selector:
    matchLabels:
      app: scraper-worker
  template:
    metadata:
      labels:
        app: scraper-worker
    spec:
      containers:
        - name: scraper
          image: dealerhunt/scraper:latest
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "2Gi"
              cpu: "1000m"
          env:
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: scraper-secrets
                  key: redis-url
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: scraper-secrets
                  key: database-url
            - name: PROXY_API_KEY
              valueFrom:
                secretKeyRef:
                  name: scraper-secrets
                  key: proxy-api-key
          volumeMounts:
            - name: browser-cache
              mountPath: /tmp/browser-cache
      volumes:
        - name: browser-cache
          emptyDir:
            sizeLimit: 1Gi
      restartPolicy: Always

---
# browser-pool-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: browser-pool
  namespace: scraping
spec:
  replicas: 5
  selector:
    matchLabels:
      app: browser-pool
  template:
    metadata:
      labels:
        app: browser-pool
    spec:
      containers:
        - name: browser
          image: mcr.microsoft.com/playwright:v1.40.0
          resources:
            requests:
              memory: "1Gi"
              cpu: "500m"
            limits:
              memory: "4Gi"
              cpu: "2000m"
          ports:
            - containerPort: 9222
          env:
            - name: DISPLAY
              value: ":99"
          volumeMounts:
            - name: browser-data
              mountPath: /browser-data
      volumes:
        - name: browser-data
          persistentVolumeClaim:
            claimName: browser-pvc

---
# scheduler-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: scraper-scheduler
  namespace: scraping
spec:
  replicas: 2
  selector:
    matchLabels:
      app: scraper-scheduler
  template:
    metadata:
      labels:
        app: scraper-scheduler
    spec:
      containers:
        - name: scheduler
          image: dealerhunt/scheduler:latest
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "250m"
          env:
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: scraper-secrets
                  key: redis-url
            - name: KAFKA_BROKERS
              valueFrom:
                secretKeyRef:
                  name: scraper-secrets
                  key: kafka-brokers
```

### 3.2 Service Configuration

```yaml
# scraper-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: scraper-service
  namespace: scraping
spec:
  selector:
    app: scraper-worker
  ports:
    - port: 8080
      targetPort: 8080
  type: ClusterIP

---
# browser-pool-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: browser-pool-service
  namespace: scraping
spec:
  selector:
    app: browser-pool
  ports:
    - port: 9222
      targetPort: 9222
  type: ClusterIP
```

### 3.3 Persistent Storage

```yaml
# browser-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: browser-pvc
  namespace: scraping
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: fast-ssd

---
# redis-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: redis-config
  namespace: scraping
data:
  redis.conf: |
    maxmemory 1gb
    maxmemory-policy allkeys-lru
    save 900 1
    save 300 10
    save 60 10000
```

## 4. Proxy Management System

### 4.1 Proxy Pool Architecture

```typescript
interface ProxyConfig {
  id: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  type: "residential" | "datacenter" | "mobile";
  location: {
    country: string;
    state?: string;
    city?: string;
  };
  performance: {
    speed: number; // Mbps
    uptime: number; // percentage
    lastCheck: Date;
  };
  usage: {
    requests: number;
    errors: number;
    cooldownUntil?: Date;
  };
}

class ProxyManager {
  private proxies: ProxyConfig[] = [];
  private currentIndex = 0;
  private healthCheckInterval: NodeJS.Timeout;

  constructor() {
    this.loadProxies();
    this.startHealthChecks();
  }

  async getProxy(sourceType: string, location?: string): Promise<ProxyConfig> {
    const availableProxies = this.proxies.filter(
      (p) =>
        p.usage.errors < 10 &&
        (!p.usage.cooldownUntil || p.usage.cooldownUntil < new Date()) &&
        this.isProxySuitable(p, sourceType, location),
    );

    if (availableProxies.length === 0) {
      throw new Error("No available proxies");
    }

    // Round-robin selection with health consideration
    const proxy = availableProxies[this.currentIndex % availableProxies.length];
    this.currentIndex++;

    proxy.usage.requests++;
    return proxy;
  }

  private isProxySuitable(
    proxy: ProxyConfig,
    sourceType: string,
    location?: string,
  ): boolean {
    // Geographic targeting for certain sources
    if (sourceType === "craigslist" && location) {
      return (
        proxy.location.state === location || proxy.location.city === location
      );
    }

    // Residential proxies for social media
    if (sourceType === "facebook_marketplace") {
      return proxy.type === "residential";
    }

    // Datacenter for auction sites
    if (["copart", "iaa", "adesa", "manheim"].includes(sourceType)) {
      return proxy.type === "datacenter";
    }

    return true;
  }

  private async startHealthChecks() {
    this.healthCheckInterval = setInterval(async () => {
      await this.checkProxyHealth();
    }, 60000); // Check every minute
  }

  private async checkProxyHealth() {
    const healthCheckPromises = this.proxies.map(async (proxy) => {
      try {
        const startTime = Date.now();
        const response = await fetch("http://httpbin.org/ip", {
          proxy: `http://${proxy.host}:${proxy.port}`,
          timeout: 10000,
        });
        const endTime = Date.now();

        proxy.performance.speed = (endTime - startTime) / 1000;
        proxy.performance.uptime = 100;
        proxy.performance.lastCheck = new Date();
        proxy.usage.errors = 0;
      } catch (error) {
        proxy.usage.errors++;
        proxy.performance.uptime = Math.max(0, proxy.performance.uptime - 10);

        if (proxy.usage.errors > 10) {
          proxy.usage.cooldownUntil = new Date(Date.now() + 300000); // 5 minutes
        }
      }
    });

    await Promise.allSettled(healthCheckPromises);
  }
}
```

### 4.2 Proxy Rotation Strategy

```typescript
class ProxyRotationStrategy {
  private static readonly ROTATION_INTERVALS = {
    copart: 100, // 100 requests per proxy
    iaa: 80,
    adesa: 60,
    manheim: 50,
    facebook_marketplace: 200,
    craigslist: 300,
    ebay_motors: 150,
    independent_dealers: 500,
    carparts: 1000,
    car_part: 800,
  };

  static shouldRotate(source: string, requestCount: number): boolean {
    const interval = this.ROTATION_INTERVALS[source] || 100;
    return requestCount % interval === 0;
  }

  static getCooldownDuration(source: string, errorType: string): number {
    const baseCooldowns = {
      rate_limit: 300000, // 5 minutes
      blocked: 600000, // 10 minutes
      temp_error: 60000, // 1 minute
      network_error: 30000, // 30 seconds
    };

    const sourceMultipliers = {
      copart: 2,
      iaa: 2,
      adesa: 1.5,
      manheim: 1.5,
      facebook_marketplace: 1,
      craigslist: 0.5,
      ebay_motors: 1,
    };

    const baseCooldown = baseCooldowns[errorType] || 60000;
    const multiplier = sourceMultipliers[source] || 1;

    return baseCooldown * multiplier;
  }
}
```

## 5. Browser Pool Management

### 5.1 Browser Pool Implementation

```typescript
import { chromium, Browser, BrowserContext, Page } from "playwright";

class BrowserPool {
  private browsers: Browser[] = [];
  private contexts: BrowserContext[] = [];
  private pages: Page[] = [];
  private maxBrowsers = 5;
  private maxContextsPerBrowser = 10;
  private maxPagesPerContext = 5;

  async initialize() {
    for (let i = 0; i < this.maxBrowsers; i++) {
      const browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-background-networking",
          "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ],
      });

      this.browsers.push(browser);

      // Create contexts for each browser
      for (let j = 0; j < this.maxContextsPerBrowser; j++) {
        const context = await browser.newContext({
          viewport: { width: 1920, height: 1080 },
          userAgent: this.getRandomUserAgent(),
          locale: "en-US",
          timezoneId: "America/New_York",
          permissions: ["geolocation"],
          geolocation: { latitude: 40.7128, longitude: -74.006 }, // NYC
          ignoreHTTPSErrors: true,
        });

        this.contexts.push(context);
      }
    }
  }

  async getPage(source: string, proxy?: ProxyConfig): Promise<Page> {
    // Find available context
    const availableContext = this.contexts.find(
      (ctx) => ctx.pages().length < this.maxPagesPerContext,
    );

    if (!availableContext) {
      throw new Error("No available browser contexts");
    }

    const page = await availableContext.newPage();

    // Configure page for stealth
    await this.configureStealth(page, source, proxy);

    this.pages.push(page);

    // Clean up page when closed
    page.on("close", () => {
      const index = this.pages.indexOf(page);
      if (index > -1) {
        this.pages.splice(index, 1);
      }
    });

    return page;
  }

  private async configureStealth(
    page: Page,
    source: string,
    proxy?: ProxyConfig,
  ) {
    // Add stealth scripts
    await page.addInitScript(() => {
      // Hide automation indicators
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
      (window as any).chrome = { runtime: {} };

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    });

    // Set proxy if provided
    if (proxy) {
      // Proxy configuration handled at browser level
    }

    // Set random user agent rotation
    await page.setUserAgent(this.getRandomUserAgent());

    // Add random delays to mimic human behavior
    await page.addInitScript(() => {
      const originalFetch = window.fetch;
      window.fetch = (...args) => {
        return new Promise((resolve) => {
          setTimeout(
            () => resolve(originalFetch(...args)),
            Math.random() * 1000,
          );
        });
      };
    });
  }

  private getRandomUserAgent(): string {
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  async cleanup() {
    // Close all pages
    await Promise.all(this.pages.map((page) => page.close()));

    // Close all contexts
    await Promise.all(this.contexts.map((ctx) => ctx.close()));

    // Close all browsers
    await Promise.all(this.browsers.map((browser) => browser.close()));
  }
}
```

## 6. Data Pipeline Architecture

### 6.1 Kafka Streaming Configuration

```yaml
# kafka-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: kafka-config
  namespace: scraping
data:
  server.properties: |
    broker.id=1
    listeners=PLAINTEXT://:9092
    num.network.threads=3
    num.io.threads=8
    socket.send.buffer.bytes=102400
    socket.receive.buffer.bytes=102400
    socket.request.max.bytes=104857600
    num.partitions=3
    num.recovery.threads.per.data.dir=1
    offsets.topic.replication.factor=1
    transaction.state.log.replication.factor=1
    transaction.state.log.min.isr=1
    log.retention.hours=168
    log.segment.bytes=1073741824
    log.retention.check.interval.ms=300000
    zookeeper.connect.time.ms=18000

---
# kafka-deployment.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: kafka
  namespace: scraping
spec:
  serviceName: kafka
  replicas: 3
  selector:
    matchLabels:
      app: kafka
  template:
    metadata:
      labels:
        app: kafka
    spec:
      containers:
        - name: kafka
          image: confluentinc/cp-kafka:latest
          ports:
            - containerPort: 9092
          env:
            - name: KAFKA_BROKER_ID
              value: "1"
            - name: KAFKA_ZOOKEEPER_CONNECT
              value: "zookeeper:2181"
            - name: KAFKA_ADVERTISED_LISTENERS
              value: "PLAINTEXT://localhost:9092"
            - name: KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR
              value: "1"
          volumeMounts:
            - name: kafka-data
              mountPath: /var/lib/kafka/data
  volumeClaimTemplates:
    - metadata:
        name: kafka-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
```

### 6.2 Data Processing Pipeline

```typescript
interface ScrapedData {
  source: string;
  data: any[];
  timestamp: Date;
  metadata: {
    proxy: string;
    browser: string;
    duration: number;
    errors: string[];
  };
}

class DataPipeline {
  private kafkaProducer: Producer;
  private redisClient: Redis;
  private database: Database;

  async processScrapedData(scrapedData: ScrapedData): Promise<void> {
    try {
      // 1. Validation
      const validatedData = await this.validateData(scrapedData);

      // 2. Deduplication
      const deduplicatedData = await this.deduplicateData(validatedData);

      // 3. Enrichment
      const enrichedData = await this.enrichData(deduplicatedData);

      // 4. Send to Kafka for processing
      await this.sendToKafka(enrichedData);

      // 5. Update cache
      await this.updateCache(enrichedData);

      // 6. Store in database
      await this.storeInDatabase(enrichedData);
    } catch (error) {
      console.error("Error processing scraped data:", error);
      await this.handleProcessingError(scrapedData, error);
    }
  }

  private async validateData(data: ScrapedData): Promise<ScrapedData> {
    const validatedItems = data.data.filter((item) => {
      // Required fields validation
      if (!item.price || item.price < 0) return false;
      if (!item.source || !item.title) return false;

      // Price range validation
      if (item.price < 100 || item.price > 1000000) return false;

      // VIN format validation (if present)
      if (item.vin && !this.isValidVIN(item.vin)) return false;

      return true;
    });

    return {
      ...data,
      data: validatedItems,
    };
  }

  private async deduplicateData(data: ScrapedData): Promise<ScrapedData> {
    const deduplicatedItems = [];

    for (const item of data.data) {
      const deduplicationKey = this.getDeduplicationKey(item);
      const exists = await this.redisClient.get(`dedup:${deduplicationKey}`);

      if (!exists) {
        deduplicatedItems.push(item);
        await this.redisClient.setex(`dedup:${deduplicationKey}`, 86400, "1"); // 24 hours
      }
    }

    return {
      ...data,
      data: deduplicatedItems,
    };
  }

  private async enrichData(data: ScrapedData): Promise<ScrapedData> {
    const enrichedItems = await Promise.all(
      data.data.map(async (item) => ({
        ...item,
        // Add profit score calculation
        profitScore: await this.calculateProfitScore(item),
        // Add geographic coordinates
        coordinates: await this.geocodeLocation(item.location),
        // Add market comparison
        marketComparison: await this.getMarketComparison(item),
        // Add transport cost estimate
        transportCost: await this.calculateTransportCost(item),
        // Add repair estimate
        repairEstimate: await this.calculateRepairEstimate(item),
      })),
    );

    return {
      ...data,
      data: enrichedItems,
    };
  }

  private async sendToKafka(data: ScrapedData): Promise<void> {
    const message = {
      key: data.source,
      value: JSON.stringify(data),
      headers: {
        timestamp: data.timestamp.toISOString(),
        source: data.source,
      },
    };

    await this.kafkaProducer.send({
      topic: "scraped-data",
      messages: [message],
    });
  }

  private async storeInDatabase(data: ScrapedData): Promise<void> {
    const batch = data.data.map((item) => ({
      id: this.generateId(),
      source: data.source,
      source_type: this.getSourceType(data.source),
      title: item.title,
      price: item.price,
      currency: item.currency || "USD",
      year: item.year,
      make: item.make,
      model: item.model,
      vin: item.vin,
      mileage: item.mileage,
      location: item.location,
      description: item.description,
      images: item.images || [],
      auction_end: item.auction_end,
      bid_count: item.bid_count,
      seller: item.seller,
      seller_type: item.seller_type,
      condition: item.condition,
      transport_cost: item.transportCost,
      repair_estimate: item.repairEstimate,
      profit_score: item.profitScore,
      scraped_at: data.timestamp,
      url: item.url,
      metadata: {
        coordinates: item.coordinates,
        marketComparison: item.marketComparison,
        scrapingMetadata: data.metadata,
      },
    }));

    await this.database.insert("listings", batch);
  }
}
```

## 7. Quality Control & Monitoring

### 7.1 Data Quality Metrics

```typescript
class QualityControl {
  private metrics: Map<string, QualityMetrics> = new Map();

  async validateScrapingRun(
    source: string,
    scrapedData: ScrapedData,
  ): Promise<QualityReport> {
    const metrics = {
      totalItems: scrapedData.data.length,
      validItems: 0,
      invalidItems: 0,
      duplicates: 0,
      errors: scrapedData.metadata.errors.length,
      duration: scrapedData.metadata.duration,
      successRate: 0,
      dataQuality: 0,
    };

    // Validate each item
    for (const item of scrapedData.data) {
      if (this.isValidItem(item)) {
        metrics.validItems++;
      } else {
        metrics.invalidItems++;
      }
    }

    // Check for duplicates
    const duplicates = await this.checkDuplicates(scrapedData.data);
    metrics.duplicates = duplicates.length;

    // Calculate success rate
    metrics.successRate = (metrics.validItems / metrics.totalItems) * 100;

    // Calculate data quality score
    metrics.dataQuality = this.calculateDataQualityScore(scrapedData);

    // Store metrics
    this.metrics.set(source, metrics);

    return {
      source,
      metrics,
      recommendations: this.generateRecommendations(metrics),
      status: this.getQualityStatus(metrics.dataQuality),
    };
  }

  private isValidItem(item: any): boolean {
    const requiredFields = ["title", "price", "source"];
    return (
      requiredFields.every((field) => item[field] != null) &&
      item.price > 0 &&
      item.price < 1000000 &&
      (!item.vin || this.isValidVIN(item.vin))
    );
  }

  private calculateDataQualityScore(data: ScrapedData): number {
    let score = 100;

    // Deduct for missing fields
    const missingFields =
      data.data.filter((item) => !item.mileage).length / data.data.length;
    score -= missingFields * 10;

    // Deduct for low image count
    const lowImageCount =
      data.data.filter((item) => !item.images || item.images.length < 3)
        .length / data.data.length;
    score -= lowImageCount * 5;

    // Deduct for errors
    score -= data.metadata.errors.length * 2;

    return Math.max(0, score);
  }

  private generateRecommendations(metrics: QualityMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.invalidItems > 0) {
      recommendations.push(
        `Improve data validation - ${metrics.invalidItems} invalid items found`,
      );
    }

    if (metrics.duplicates > 0) {
      recommendations.push(
        `Review deduplication logic - ${metrics.duplicates} duplicates found`,
      );
    }

    if (metrics.duration > 60000) {
      recommendations.push(
        "Optimize scraping performance - duration exceeds 60 seconds",
      );
    }

    if (metrics.errors > 5) {
      recommendations.push("Review error handling - high error rate detected");
    }

    if (metrics.dataQuality < 80) {
      recommendations.push("Improve data quality - current score below 80%");
    }

    return recommendations;
  }
}
```

### 7.2 Monitoring Dashboard

```typescript
class ScrapingMonitor {
  private metrics: Map<string, SourceMetrics> = new Map();

  async updateMetrics(source: string, metrics: SourceMetrics): Promise<void> {
    this.metrics.set(source, {
      ...this.metrics.get(source),
      ...metrics,
      lastUpdate: new Date(),
    });

    // Send to monitoring system
    await this.sendToMonitoring(source, metrics);
  }

  async getHealthStatus(): Promise<HealthStatus> {
    const sources = Array.from(this.metrics.keys());
    const healthySources = sources.filter((source) => {
      const metrics = this.metrics.get(source)!;
      return metrics.successRate > 80 && metrics.lastError === null;
    });

    return {
      overall: (healthySources.length / sources.length) * 100,
      sources: sources.map((source) => ({
        name: source,
        status: this.getSourceStatus(this.metrics.get(source)!),
        metrics: this.metrics.get(source)!,
      })),
      alerts: this.generateAlerts(),
    };
  }

  private generateAlerts(): Alert[] {
    const alerts: Alert[] = [];

    for (const [source, metrics] of this.metrics) {
      // High error rate alert
      if (metrics.errorRate > 20) {
        alerts.push({
          type: "error_rate",
          source,
          message: `High error rate: ${metrics.errorRate}%`,
          severity: "high",
        });
      }

      // Low success rate alert
      if (metrics.successRate < 70) {
        alerts.push({
          type: "success_rate",
          source,
          message: `Low success rate: ${metrics.successRate}%`,
          severity: "medium",
        });
      }

      // Performance alert
      if (metrics.averageDuration > 120000) {
        alerts.push({
          type: "performance",
          source,
          message: `Slow performance: ${metrics.averageDuration}ms average`,
          severity: "low",
        });
      }
    }

    return alerts;
  }
}
```

## 8. Error Handling & Recovery

### 8.1 Error Classification

```typescript
enum ErrorType {
  NETWORK_ERROR = "network_error",
  RATE_LIMIT = "rate_limit",
  BLOCKED = "blocked",
  AUTHENTICATION = "authentication",
  PARSE_ERROR = "parse_error",
  TEMPORARY_ERROR = "temporary_error",
  PERMANENT_ERROR = "permanent_error",
}

class ErrorHandler {
  private static readonly RETRY_STRATEGIES = {
    [ErrorType.NETWORK_ERROR]: { maxRetries: 3, backoff: 1000 },
    [ErrorType.RATE_LIMIT]: { maxRetries: 5, backoff: 5000 },
    [ErrorType.TEMPORARY_ERROR]: { maxRetries: 2, backoff: 2000 },
    [ErrorType.BLOCKED]: { maxRetries: 0, backoff: 0 },
    [ErrorType.PERMANENT_ERROR]: { maxRetries: 0, backoff: 0 },
  };

  async handleError(
    error: Error,
    source: string,
    context: any,
  ): Promise<ErrorHandlingResult> {
    const errorType = this.classifyError(error);
    const strategy = ErrorHandler.RETRY_STRATEGIES[errorType];

    if (strategy.maxRetries === 0) {
      return {
        shouldRetry: false,
        cooldownDuration: this.getCooldownDuration(errorType, source),
        escalationRequired: errorType === ErrorType.PERMANENT_ERROR,
      };
    }

    const retryCount = context.retryCount || 0;
    if (retryCount >= strategy.maxRetries) {
      return {
        shouldRetry: false,
        cooldownDuration: this.getCooldownDuration(errorType, source),
        escalationRequired: true,
      };
    }

    return {
      shouldRetry: true,
      cooldownDuration: strategy.backoff * Math.pow(2, retryCount),
      escalationRequired: false,
    };
  }

  private classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    if (
      message.includes("rate limit") ||
      message.includes("too many requests")
    ) {
      return ErrorType.RATE_LIMIT;
    }

    if (
      message.includes("blocked") ||
      message.includes("forbidden") ||
      message.includes("403")
    ) {
      return ErrorType.BLOCKED;
    }

    if (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("ECONNRESET")
    ) {
      return ErrorType.NETWORK_ERROR;
    }

    if (message.includes("unauthorized") || message.includes("401")) {
      return ErrorType.AUTHENTICATION;
    }

    if (message.includes("parse") || message.includes("invalid json")) {
      return ErrorType.PARSE_ERROR;
    }

    return ErrorType.TEMPORARY_ERROR;
  }

  private getCooldownDuration(errorType: ErrorType, source: string): number {
    const baseCooldowns = {
      [ErrorType.RATE_LIMIT]: 300000, // 5 minutes
      [ErrorType.BLOCKED]: 600000, // 10 minutes
      [ErrorType.NETWORK_ERROR]: 30000, // 30 seconds
      [ErrorType.AUTHENTICATION]: 600000, // 10 minutes
      [ErrorType.TEMPORARY_ERROR]: 60000, // 1 minute
      [ErrorType.PERMANENT_ERROR]: 3600000, // 1 hour
    };

    return baseCooldowns[errorType] || 60000;
  }
}
```

## 9. Performance Optimization

### 9.1 Caching Strategy

```typescript
class ScrapingCache {
  private redis: Redis;
  private cacheConfig: CacheConfig;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
    this.cacheConfig = {
      sourceData: 300, // 5 minutes
      proxyHealth: 60, // 1 minute
      deduplication: 86400, // 24 hours
      enrichment: 3600, // 1 hour
      metadata: 1800, // 30 minutes
    };
  }

  async getCachedData(key: string, type: keyof CacheConfig): Promise<any> {
    const cached = await this.redis.get(`cache:${type}:${key}`);
    return cached ? JSON.parse(cached) : null;
  }

  async setCachedData(
    key: string,
    type: keyof CacheConfig,
    data: any,
  ): Promise<void> {
    const ttl = this.cacheConfig[type];
    await this.redis.setex(`cache:${type}:${key}`, ttl, JSON.stringify(data));
  }

  async invalidateCache(pattern: string): Promise<void> {
    const keys = await this.redis.keys(`cache:*:${pattern}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

### 9.2 Resource Optimization

```typescript
class ResourceOptimizer {
  private resourceMetrics: Map<string, ResourceMetrics> = new Map();

  async optimizeResources(): Promise<OptimizationPlan> {
    const currentUsage = await this.getCurrentResourceUsage();
    const recommendations =
      this.generateOptimizationRecommendations(currentUsage);

    return {
      currentUsage,
      recommendations,
      estimatedSavings: this.calculateSavings(recommendations),
      implementationPlan: this.createImplementationPlan(recommendations),
    };
  }

  private generateOptimizationRecommendations(
    usage: ResourceUsage,
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Browser pool optimization
    if (usage.browserUtilization < 50) {
      recommendations.push({
        type: "reduce_browser_pool",
        description: "Reduce browser pool size by 50%",
        savings: "40% reduction in memory usage",
        priority: "high",
      });
    }

    // Proxy optimization
    if (usage.proxyUtilization < 30) {
      recommendations.push({
        type: "optimize_proxy_pool",
        description: "Reduce proxy pool size",
        savings: "30% reduction in costs",
        priority: "medium",
      });
    }

    // Scheduling optimization
    if (usage.peakLoad > 80) {
      recommendations.push({
        type: "optimize_scheduling",
        description: "Stagger high-priority scrapes",
        savings: "25% reduction in peak load",
        priority: "high",
      });
    }

    return recommendations;
  }
}
```

## 10. Deployment & Scaling

### 10.1 Auto-scaling Configuration

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: scraper-workers-hpa
  namespace: scraping
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: scraper-workers
  minReplicas: 5
  maxReplicas: 50
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
        - type: Pods
          value: 5
          periodSeconds: 60
      selectPolicy: Max
```

### 10.2 Scaling Strategy

```typescript
class ScalingManager {
  private currentLoad: Map<string, number> = new Map();
  private scalingThresholds = {
    cpu: 70,
    memory: 80,
    queueSize: 1000,
    errorRate: 10,
  };

  async checkScalingNeeds(): Promise<ScalingDecision[]> {
    const decisions: ScalingDecision[] = [];

    for (const [source, load] of this.currentLoad) {
      const metrics = await this.getSourceMetrics(source);
      const decision = this.evaluateScalingNeed(source, metrics, load);

      if (decision.action !== "none") {
        decisions.push(decision);
      }
    }

    return decisions;
  }

  private evaluateScalingNeed(
    source: string,
    metrics: SourceMetrics,
    load: number,
  ): ScalingDecision {
    if (
      metrics.cpu > this.scalingThresholds.cpu ||
      metrics.memory > this.scalingThresholds.memory
    ) {
      return {
        source,
        action: "scale_up",
        reason: `High resource usage: CPU ${metrics.cpu}%, Memory ${metrics.memory}%`,
        targetReplicas: Math.min(50, Math.ceil(load * 1.5)),
      };
    }

    if (metrics.cpu < 30 && metrics.memory < 40 && load > 10) {
      return {
        source,
        action: "scale_down",
        reason: "Low resource usage with excess capacity",
        targetReplicas: Math.max(5, Math.floor(load * 0.7)),
      };
    }

    return {
      source,
      action: "none",
      reason: "Optimal resource usage",
      targetReplicas: 0,
    };
  }
}
```

## 11. Cost Management

### 11.1 Cost Optimization

```typescript
class CostManager {
  private costMetrics: Map<string, CostMetrics> = new Map();

  async calculateMonthlyCost(): Promise<CostBreakdown> {
    const breakdown: CostBreakdown = {
      compute: 0,
      storage: 0,
      network: 0,
      proxies: 0,
      databases: 0,
      monitoring: 0,
      total: 0,
    };

    // Compute costs
    breakdown.compute = await this.calculateComputeCosts();

    // Storage costs
    breakdown.storage = await this.calculateStorageCosts();

    // Network costs
    breakdown.network = await this.calculateNetworkCosts();

    // Proxy costs
    breakdown.proxies = await this.calculateProxyCosts();

    // Database costs
    breakdown.databases = await this.calculateDatabaseCosts();

    // Monitoring costs
    breakdown.monitoring = await this.calculateMonitoringCosts();

    breakdown.total = Object.values(breakdown).reduce(
      (sum, cost) => sum + cost,
      0,
    );

    return breakdown;
  }

  async generateCostOptimizationReport(): Promise<CostOptimizationReport> {
    const currentCosts = await this.calculateMonthlyCost();
    const optimizations = await this.identifyOptimizations();
    const potentialSavings = optimizations.reduce(
      (sum, opt) => sum + opt.savings,
      0,
    );

    return {
      currentCosts,
      optimizations,
      potentialSavings,
      optimizedTotal: currentCosts.total - potentialSavings,
      savingsPercentage: (potentialSavings / currentCosts.total) * 100,
    };
  }

  private async identifyOptimizations(): Promise<Optimization[]> {
    const optimizations: Optimization[] = [];

    // Browser pool optimization
    optimizations.push({
      name: "Optimize Browser Pool",
      description: "Reduce browser pool size during off-peak hours",
      currentCost: 2000,
      optimizedCost: 1200,
      savings: 800,
      implementation: "Configure HPA with time-based scaling",
    });

    // Proxy optimization
    optimizations.push({
      name: "Optimize Proxy Usage",
      description: "Use cheaper datacenter proxies for non-sensitive sources",
      currentCost: 1500,
      optimizedCost: 900,
      savings: 600,
      implementation: "Implement proxy type selection logic",
    });

    // Storage optimization
    optimizations.push({
      name: "Optimize Data Storage",
      description: "Archive old data to cheaper storage tiers",
      currentCost: 800,
      optimizedCost: 400,
      savings: 400,
      implementation: "Configure data lifecycle policies",
    });

    return optimizations;
  }
}
```

This comprehensive scraping infrastructure plan provides the foundation for DealerHunt's data acquisition capabilities with enterprise-grade scalability, reliability, and cost-effectiveness.
