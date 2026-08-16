CREATE TABLE IF NOT EXISTS public.car_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id UUID NOT NULL REFERENCES public.cars(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  description TEXT NOT NULL,
  km_at_service INTEGER NOT NULL DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_car_services_car_id ON public.car_services(car_id);
CREATE INDEX IF NOT EXISTS idx_car_services_service_date ON public.car_services(service_date);

CREATE POLICY "Access car services" ON public.car_services
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM cars
    WHERE (
      cars.id = car_services.car_id
      AND (
        cars.user_id = auth.uid()
        OR (
          EXISTS (
            SELECT 1 FROM car_shares
            WHERE (
              car_shares.car_id = cars.id
              AND car_shares.shared_with_email = (auth.jwt() ->> 'email')
              AND car_shares.status = 'ACCEPTED'
            )
          )
        )
      )
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM cars
    WHERE (
      cars.id = car_services.car_id
      AND (
        cars.user_id = auth.uid()
        OR (
          EXISTS (
            SELECT 1 FROM car_shares
            WHERE (
              car_shares.car_id = cars.id
              AND car_shares.shared_with_email = (auth.jwt() ->> 'email')
              AND car_shares.status = 'ACCEPTED'
              AND car_shares.permission = 'WRITE'
            )
          )
        )
      )
    )
  )
);
