import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { GeorefService } from '../../services/georef.service';
import { GeorefProvince, GeorefMunicipality } from '../../models/georef-models';
import { firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';

@Component({
  selector: 'app-location-dropdowns',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './location-dropdowns.component.html',
  styleUrls: ['./location-dropdowns.component.css']
})
export class LocationDropdownsComponent implements OnInit, OnChanges {
  @Input() selectedProvinceId: string | null = null;
  @Input() selectedCityId: string | null = null;
  @Input() forceLoadMunicipalities: boolean = false;

  @Output() provinceChange = new EventEmitter<string | null>();
  @Output() cityChange = new EventEmitter<string | null>();
  @Output() provincesLoaded = new EventEmitter<GeorefProvince[]>();
  @Output() cityDetailsSelected = new EventEmitter<GeorefMunicipality | null>();

  public provinces: GeorefProvince[] = [];
  public municipalities: GeorefMunicipality[] = [];
  isLoadingMunicipalities: boolean = false;
  disableCity: boolean = true;
  isLoadingProvinces: boolean = false;
  private hasLoadedProvincesInitially: boolean = false;

  constructor(private georefService: GeorefService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadProvinces();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedProvinceId'] && !changes['selectedProvinceId'].isFirstChange() && changes['selectedProvinceId'].currentValue !== this.selectedProvinceId) {
      this.selectedProvinceId = changes['selectedProvinceId'].currentValue;
      if (this.selectedProvinceId) {
        this.loadMunicipalitiesByProvince(this.selectedProvinceId, { emitEvents: false });
      } else {
        this.municipalities = [];
        this.disableCity = true;
        this.onCityChange(null);
      }
    }

    if (changes['selectedCityId'] && !changes['selectedCityId'].isFirstChange() && changes['selectedCityId'].currentValue !== this.selectedCityId) {
      this.selectedCityId = changes['selectedCityId'].currentValue;
      if (this.selectedCityId && this.municipalities.length > 0) {
        const cityFound = this.municipalities.find(m => m.id === this.selectedCityId);
      } else if (!this.selectedCityId) {
          this.selectedCityId = null;
      }
      this.emitCityDetails();
    }
  }

  async loadProvinces(): Promise<void> {
    if (this.isLoadingProvinces || this.hasLoadedProvincesInitially) {
      return;
    }

    this.isLoadingProvinces = true;
    try {
      const provinces = await firstValueFrom(this.georefService.getProvinces().pipe(
        catchError(error => {
          console.error('Error al cargar provincias:', error);
          this.isLoadingProvinces = false;
          return of([]);
        })
      ));
      this.provinces = provinces.sort((a, b) => a.nombre.localeCompare(b.nombre));
      this.provincesLoaded.emit(this.provinces);
      this.hasLoadedProvincesInitially = true;

      if (this.selectedProvinceId) {
        this.loadMunicipalitiesByProvince(this.selectedProvinceId, { emitEvents: false });
      }
    } catch (error) {
      console.error('Error al cargar provincias:', error);
    } finally {
      this.isLoadingProvinces = false;
      this.cdr.detectChanges();
    }
  }

  async loadMunicipalitiesByProvince(provinceId: string, options?: { emitEvents: boolean }): Promise<void> {
    this.isLoadingMunicipalities = true;
    this.municipalities = [];
    this.disableCity = true;
    const emitEvents = options?.emitEvents ?? true;

    try {
      const municipalities = await firstValueFrom(this.georefService.getMunicipalitiesByProvinceId(provinceId).pipe(
        catchError(error => {
          console.error('Error al cargar municipios:', error);
          this.isLoadingMunicipalities = false;
          return of([]);
        })
      ));
      this.municipalities = municipalities.sort((a, b) => a.nombre.localeCompare(b.nombre));
      this.disableCity = this.municipalities.length === 0;

      if (emitEvents && this.selectedCityId && this.municipalities.some(m => m.id === this.selectedCityId)) {
      } else if (emitEvents && this.selectedCityId) {
          this.selectedCityId = null;
          this.onCityChange(null);
      } else if (emitEvents && !this.selectedCityId) {
          this.onCityChange(null);
      }
    } catch (error) {
      console.error('Error al cargar municipios:', error);
    } finally {
      this.isLoadingMunicipalities = false;
      this.cdr.detectChanges();
      this.emitCityDetails();
    }
  }

  onProvinceChange(newProvinceId: string | null): void {
    this.selectedProvinceId = newProvinceId;
    this.selectedCityId = null;

    this.provinceChange.emit(newProvinceId);
    this.cityChange.emit(null);

    if (newProvinceId) {
      this.loadMunicipalitiesByProvince(newProvinceId);
    } else {
      this.municipalities = [];
      this.disableCity = true;
      this.emitCityDetails();
    }
  }

  onCityChange(newCityId: string | null): void {
    this.selectedCityId = newCityId;
    this.cityChange.emit(newCityId);
    this.emitCityDetails();
  }

  private emitCityDetails(): void {
      const selectedCityDetails = this.selectedCityId ? this.municipalities.find(m => m.id === this.selectedCityId) : null;
      this.cityDetailsSelected.emit(selectedCityDetails);
  }

  async setDropdownValues(provinceId: string | null, cityId: string | null, emitEvents: boolean = true): Promise<void> {
    this.selectedProvinceId = provinceId;
    this.selectedCityId = cityId;

    if (provinceId) {
      await this.loadMunicipalitiesByProvince(provinceId, { emitEvents: false });
      if (cityId && !this.municipalities.some(m => m.id === cityId)) {
        this.selectedCityId = null;
      }
    } else {
      this.municipalities = [];
      this.disableCity = true;
      this.selectedCityId = null;
    }
    this.cdr.detectChanges();

    if (emitEvents) {
      this.provinceChange.emit(this.selectedProvinceId);
      this.cityChange.emit(this.selectedCityId);
      this.emitCityDetails();
    }
  }
}