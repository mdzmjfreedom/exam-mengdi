import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const skip = parseInt(searchParams.get('skip') || '0');
  const take = parseInt(searchParams.get('take') || '50');
  const search = searchParams.get('search') || '';

  try {
    const whereClause = search ? {
      OR: [
        { externalCode: { contains: search } },
        { receiverName: { contains: search } },
      ]
    } : {};

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: whereClause,
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.order.count({ where: whereClause })
    ]);

    return NextResponse.json({ data: orders, total });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const orders = await request.json();

    if (!Array.isArray(orders)) {
      return NextResponse.json({ error: 'Payload must be an array' }, { status: 400 });
    }

    // Process chunk insertion
    // In SQLite, createMany is not supported, so we use a transaction
    // For Vercel Postgres, createMany works. 
    // Since we're using Prisma's promise.all we can safely handle it.

    const result = await prisma.$transaction(
      orders.map(order => prisma.order.create({ data: order }))
    );

    return NextResponse.json({ success: true, count: result.length });
  } catch (error) {
    console.error('Order bulk insert error:', error);
    return NextResponse.json({ error: 'Failed to insert orders' }, { status: 500 });
  }
}
