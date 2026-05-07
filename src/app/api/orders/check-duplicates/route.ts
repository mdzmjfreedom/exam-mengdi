import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { codes } = await request.json();

    if (!Array.isArray(codes) || codes.length === 0) {
      return NextResponse.json({ duplicates: [] });
    }

    // Find orders with matching external codes
    const existing = await prisma.order.findMany({
      where: {
        externalCode: { in: codes },
      },
      select: { externalCode: true },
    });

    const duplicates = existing.map(o => o.externalCode).filter(Boolean);

    return NextResponse.json({ duplicates });
  } catch (error) {
    console.error('Check duplicates error:', error);
    return NextResponse.json({ error: 'Failed to check duplicates' }, { status: 500 });
  }
}
