import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ dealerId: string }> }) {
  const { dealerId } = await params
  const supabase = createServerComponentClient()

  try {
    const { data: inventory, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('dealer_id', dealerId)
      .eq('stage', 'listed')
      .limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const vehicles = (inventory || []).map((item) => ({
      id: item.id,
      vin: item.vin,
      year: item.year,
      make: item.make,
      model: item.model,
      trim: item.trim,
      price: Math.round(item.list_price || item.market_value || 0),
      mileage: item.odometer,
      condition: item.condition,
      image_url: item.photos?.[0],
    }))

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<inventory>
  <dealer>
    <id>${dealerId}</id>
    <name>DealerHunt Dealer</name>
  </dealer>
  <vehicles>
    ${vehicles
      .map(
        (v) => `
    <vehicle>
      <id>${v.id}</id>
      <vin>${v.vin}</vin>
      <year>${v.year}</year>
      <make>${v.make}</make>
      <model>${v.model}</model>
      <trim>${v.trim || ''}</trim>
      <price>${v.price}</price>
      <mileage>${v.mileage || ''}</mileage>
      <condition>${v.condition}</condition>
      <image_url>${v.image_url || ''}</image_url>
    </vehicle>`
      )
      .join('')}
  </vehicles>
</inventory>`

    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 's-maxage=3600, stale-while-revalidate',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
