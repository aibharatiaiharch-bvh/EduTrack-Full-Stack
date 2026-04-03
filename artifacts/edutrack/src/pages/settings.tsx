import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Settings() {
  return (
    <AppLayout>
      <div className="p-8 space-y-8 max-w-4xl">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your platform preferences and institution details.</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Institution Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Institution Name</label>
                <Input defaultValue="EduTrack Academy" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Contact Email</label>
                <Input type="email" defaultValue="admin@edutrack.edu" />
              </div>
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Timezone</label>
              <Select defaultValue="america-new_york">
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="america-new_york">Eastern Time (US & Canada)</SelectItem>
                  <SelectItem value="america-chicago">Central Time (US & Canada)</SelectItem>
                  <SelectItem value="america-denver">Mountain Time (US & Canada)</SelectItem>
                  <SelectItem value="america-los_angeles">Pacific Time (US & Canada)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button>Update Preferences</Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
