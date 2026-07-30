import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { OrderTicket } from '../features/execution/OrderTicket';
import { PositionsList } from '../features/execution/PositionsList';
import { OrdersList } from '../features/execution/OrdersList';

export function PositionsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight text-ink-primary">Positions</h1>
          <p className="mt-1 text-sm text-ink-secondary">Paper trading -- simulated fills, fully risk-gated, never a real exchange.</p>
        </div>
        <OrderTicket />
      </div>

      <Tabs defaultValue="positions">
        <TabsList>
          <TabsTrigger value="positions">Open Positions</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
        </TabsList>
        <TabsContent value="positions" className="mt-4 animate-fade-in">
          <PositionsList />
        </TabsContent>
        <TabsContent value="orders" className="mt-4 animate-fade-in">
          <OrdersList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
